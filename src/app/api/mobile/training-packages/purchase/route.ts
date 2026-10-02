import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { calculateOrganizationPayment, organizationCheckoutLineItems, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'
import { assertStripeHostedUrl, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { idempotencyKeyFor, requestIdFor } from '@/lib/requestSecurity'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (requestId: string, code: string, message: string, status: number, retryable = status >= 500) =>
  NextResponse.json({ error: { code, message, retryable, request_id: requestId } }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return fail(requestId, 'unauthorized', 'Authentication is required.', 401, false)
  const body = await request.json().catch(() => ({}))
  const purchaseId = String(body.purchase_id || '').trim()
  const packageId = String(body.package_id || '').trim()
  const athleteId = String(body.athlete_id || '').trim()
  if (!purchaseId || !packageId || !athleteId) return fail(requestId, 'invalid_request', 'Purchase, package, and athlete are required.', 422, false)
  if (body.authorization_accepted !== true) return fail(requestId, 'authorization_required', 'Confirm the payment authorization before continuing.', 422, false)
  const resolvedKey = idempotencyKeyFor(request, body)
  if ('error' in resolvedKey) return fail(requestId, 'idempotency_key_required', 'A valid idempotency key is required.', 422, false)
  if (!(await enforcePaymentRateLimit(user.id, 'training_package_checkout', 8, 60).catch(() => false))) {
    return fail(requestId, 'rate_limited', 'Too many checkout requests. Please try again shortly.', 429, true)
  }

  const { data: purchase, error: purchaseError } = await supabaseAdmin.from('org_training_package_purchases')
    .select('id,org_id,package_id,athlete_id,purchaser_user_id,status,stripe_checkout_session_id,stripe_subscription_id,org_training_packages(id,name,description,price_cents,billing_type,billing_interval,status)')
    .eq('id', purchaseId).maybeSingle()
  if (purchaseError) return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
  if (!purchase || purchase.package_id !== packageId || purchase.athlete_id !== athleteId || purchase.purchaser_user_id !== user.id) {
    return fail(requestId, 'purchase_unavailable', 'This training package purchase is unavailable.', 404, false)
  }
  if (!(await userOwnsAthleteProfile(supabaseAdmin, user.id, athleteId))) return fail(requestId, 'athlete_forbidden', 'This athlete profile is unavailable.', 403, false)
  const pkg = (Array.isArray(purchase.org_training_packages) ? purchase.org_training_packages[0] : purchase.org_training_packages) as any
  if (!pkg || pkg.status !== 'published' || pkg.id !== packageId) return fail(requestId, 'package_unavailable', 'This training package is no longer available.', 409, false)
  if (purchase.status !== 'pending') return fail(requestId, 'duplicate_purchase', 'This purchase has already been processed.', 409, false)

  if (purchase.stripe_checkout_session_id) {
    const prior = await stripe.checkout.sessions.retrieve(purchase.stripe_checkout_session_id).catch(() => null)
    if (prior?.status === 'open' && prior.url) return NextResponse.json({ checkout_url: assertStripeHostedUrl(prior.url), purchase_id: purchase.id, expires_at: new Date(prior.expires_at * 1000).toISOString(), reused: true })
    if (prior?.status === 'complete') return fail(requestId, 'payment_processing', 'This payment is being confirmed.', 409, false)
  }

  const connect = await loadStripeConnectAccountStatus('org', purchase.org_id, { refresh: true }).catch(() => null)
  if (!isStripeConnectEnabled(connect)) return fail(requestId, 'connect_setup_incomplete', 'This organization is still setting up payments.', 409, false)
  const live = String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')
  if (Boolean(connect?.livemode) !== live) return fail(requestId, 'stripe_environment_mismatch', 'Payments are unavailable in this environment.', 409, false)

  const { data: profile } = await supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', user.id).maybeSingle()
  const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('id')
    .eq('workspace_type', 'organization').eq('organization_id', purchase.org_id).eq('status', 'active').maybeSingle()
  if (!workspace) return fail(requestId, 'workspace_unavailable', 'The organization workspace is unavailable.', 409, false)
  let customerId = profile?.stripe_customer_id || null
  try {
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, metadata: { coaches_hive_user_id: user.id } }, { idempotencyKey: `training-customer:${user.id}` })
      customerId = customer.id
      const { error } = await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
      if (error) throw error
    }
    const payment = calculateOrganizationPayment(Number(pkg.price_cents))
    const recurring = pkg.billing_type === 'recurring'
    const interval: 'month' | 'year' = pkg.billing_interval === 'year' ? 'year' : 'month'
    const metadata = {
      source: 'org_training_package', checkout_type: 'training_package', request_id: requestId,
      purchase_id: purchase.id, payment_record_id: purchase.id, package_id: pkg.id,
      athlete_id: athleteId, payer_user_id: user.id, org_id: purchase.org_id,
      workspace_id: workspace.id, billing_interval: recurring ? interval : '',
      platformFeeCents: String(payment.platform_fee_cents), ...organizationPaymentMetadata(payment),
    }
    const oneTimeLines = organizationCheckoutLineItems(pkg.name, payment)
    const recurringLines = oneTimeLines.map(line => ({
      ...line,
      price_data: { ...line.price_data, recurring: { interval } },
    }))
    const applicationFeePercent = Number(((payment.application_fee_cents / payment.total_cents) * 100).toFixed(2))
    const session = await stripe.checkout.sessions.create({
      mode: recurring ? 'subscription' : 'payment', customer: customerId,
      payment_method_types: ['card'], line_items: recurring ? recurringLines : oneTimeLines,
      client_reference_id: user.id, metadata,
      ...(recurring ? {
        subscription_data: { application_fee_percent: applicationFeePercent, transfer_data: { destination: connect!.stripeAccountId }, metadata },
      } : {
        payment_intent_data: { application_fee_amount: payment.application_fee_cents, transfer_data: { destination: connect!.stripeAccountId }, on_behalf_of: connect!.stripeAccountId, metadata },
      }),
      success_url: `${resolveBaseUrl()}/mobile/payment-return?status=processing&type=training_package&purchase_id=${purchase.id}`,
      cancel_url: `${resolveBaseUrl()}/mobile/payment-return?status=canceled&type=training_package&purchase_id=${purchase.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, { idempotencyKey: `training-package:${purchase.id}:${resolvedKey.key}` })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    const { error: bindError } = await supabaseAdmin.from('org_training_package_purchases').update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', purchase.id).eq('status', 'pending')
    if (bindError) throw bindError
    return NextResponse.json({ checkout_url: assertStripeHostedUrl(session.url), purchase_id: purchase.id, expires_at: new Date(session.expires_at * 1000).toISOString(), fee_breakdown: payment }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    safePaymentError('[training-packages/purchase] failed', error, { request_id: requestId, purchase_id: purchaseId, org_id: purchase.org_id })
    return fail(requestId, 'checkout_unavailable', 'Unable to start training package checkout.', 502, true)
  }
}
