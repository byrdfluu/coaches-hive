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
import { canonicalCheckoutResponse, checkoutJson, recordCheckoutAttempt } from '@/lib/checkoutAttempts'
import { fulfillMobileCheckoutSession } from '@/lib/mobileCheckoutFulfillment'
import { parseUuid } from '@/lib/uuid'
import { mobileApiError } from '@/lib/mobileApiContract'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (requestId: string, code: string, message: string, status: number, retryable = status >= 500) =>
  mobileApiError({ code, message, status, retryable, requestId })

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return fail(requestId, 'unauthorized', 'Authentication is required.', 401, false)
  const body = await request.json().catch(() => ({}))
  // PostgreSQL UUID comparisons are case-insensitive, but PostgREST returns
  // canonical lowercase UUID strings. Normalize mobile UUID input before later
  // JavaScript equality checks so uppercase iOS UUIDs are not rejected after a
  // successful database lookup.
  const purchaseId = parseUuid(body.purchase_id || body.checkout_record_id) || ''
  const packageId = parseUuid(body.package_id || body.offering_id)
  const athleteId = parseUuid(body.athlete_profile_id || body.athlete_id)
  if (!packageId || !athleteId) return fail(requestId, 'invalid_request', 'Package and athlete are required.', 422, false)
  if (body.authorization_accepted !== true) return fail(requestId, 'authorization_required', 'Confirm the payment authorization before continuing.', 422, false)
  const resolvedKey = idempotencyKeyFor(request, body)
  if ('error' in resolvedKey) return fail(requestId, 'idempotency_key_required', 'A valid idempotency key is required.', 422, false)
  if (!(await enforcePaymentRateLimit(user.id, 'training_package_checkout', 8, 60).catch(() => false))) {
    return fail(requestId, 'rate_limited', 'Too many checkout requests. Please try again shortly.', 429, true)
  }

  console.info('[training-packages/purchase] parsed request', {
    request_id: requestId,
    user_id: user.id,
    purchase_id: purchaseId || null,
    package_id: packageId,
    athlete_id: athleteId,
  })
  if (!(await userOwnsAthleteProfile(supabaseAdmin, user.id, athleteId))) {
    return fail(requestId, 'athlete_forbidden', 'This athlete profile is unavailable.', 403, false)
  }
  const { data: authoritativePackage, error: packageError } = await supabaseAdmin
    .from('org_training_packages')
    .select('id,org_id,name,description,price_cents,billing_type,billing_interval,status,purchase_limit')
    .eq('id', packageId)
    .eq('status', 'published')
    .maybeSingle()
  if (packageError) return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
  if (!authoritativePackage) return fail(requestId, 'package_unavailable', 'This training package is no longer available.', 409, false)
  if (authoritativePackage.purchase_limit != null) {
    const { count, error: limitError } = await supabaseAdmin.from('org_training_package_purchases')
      .select('id', { count: 'exact', head: true }).eq('package_id', packageId).eq('athlete_id', athleteId)
      .in('status', ['active','paid'])
    if (limitError) return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
    if (Number(count || 0) >= Number(authoritativePackage.purchase_limit)) {
      return fail(requestId, 'purchase_limit_reached', 'The purchase limit for this training package has been reached.', 409, false)
    }
  }

  let { data: purchase, error: purchaseError } = purchaseId
    ? await supabaseAdmin.from('org_training_package_purchases')
    .select('id,org_id,package_id,athlete_id,purchaser_user_id,status,created_at,updated_at,stripe_checkout_session_id,stripe_subscription_id,superseded_at,org_training_packages(id,name,description,price_cents,billing_type,billing_interval,status)')
    .eq('id', purchaseId).maybeSingle()
    : { data: null as any, error: null as any }
  if (purchaseError) return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
  if (purchase && (purchase.package_id !== packageId || purchase.athlete_id !== athleteId || purchase.superseded_at || !['pending','active','paid','past_due'].includes(String(purchase.status)))) {
    purchase = null
  }
  if (!purchase) {
    const fallback = await supabaseAdmin.from('org_training_package_purchases')
      .select('id,org_id,package_id,athlete_id,purchaser_user_id,status,created_at,updated_at,stripe_checkout_session_id,stripe_subscription_id,superseded_at,org_training_packages(id,name,description,price_cents,billing_type,billing_interval,status)')
      .eq('package_id', packageId).eq('athlete_id', athleteId)
      .eq('status', 'pending').is('superseded_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (fallback.error) return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
    purchase = fallback.data
  }
  // A pending purchase can be created while the athlete is signed in and then
  // opened by an authorized guardian (or vice versa). The athlete is the
  // entitlement owner; purchaser_user_id identifies the current payer. Safely
  // rebind only an untouched pending row so family account switching does not
  // strand the checkout or take over an existing Stripe purchase.
  if (purchase && purchase.purchaser_user_id !== user.id) {
    if (purchase.status !== 'pending' || purchase.stripe_checkout_session_id || purchase.stripe_subscription_id) {
      purchase = null
    } else {
      const { data: rebound, error: reboundError } = await supabaseAdmin
        .from('org_training_package_purchases')
        .update({ purchaser_user_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', purchase.id)
        .eq('status', 'pending')
        .is('superseded_at', null)
        .is('stripe_checkout_session_id', null)
        .is('stripe_subscription_id', null)
        .select('id,org_id,package_id,athlete_id,purchaser_user_id,status,stripe_checkout_session_id,stripe_subscription_id')
        .maybeSingle()
      if (reboundError) return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
      purchase = rebound ? { ...rebound, org_training_packages: authoritativePackage } : null
    }
  }
  if (!purchase) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('org_training_package_purchases')
      .insert({
        org_id: authoritativePackage.org_id,
        package_id: authoritativePackage.id,
        athlete_id: athleteId,
        purchaser_user_id: user.id,
        status: 'pending',
      })
      .select('id,org_id,package_id,athlete_id,purchaser_user_id,status,created_at,updated_at,stripe_checkout_session_id,stripe_subscription_id,superseded_at')
      .single()
    if (createError || !created) {
      safePaymentError('[training-packages/purchase] pending purchase creation failed', createError || new Error('Purchase was not returned'), {
        request_id: requestId,
        package_id: packageId,
        athlete_id: athleteId,
        org_id: authoritativePackage.org_id,
      })
      return fail(requestId, 'checkout_unavailable', 'Training package checkout is temporarily unavailable.', 503, true)
    }
    purchase = { ...created, org_training_packages: authoritativePackage }
  }
  const pkg = authoritativePackage
  if (!pkg || pkg.status !== 'published' || pkg.id !== packageId) return fail(requestId, 'package_unavailable', 'This training package is no longer available.', 409, false)
  if (['active','paid','past_due'].includes(String(purchase.status))) {
    return fail(requestId, 'purchase_already_active', 'This training package is already active for the selected athlete.', 409, false)
  }
  if (purchase.status !== 'pending') return fail(requestId, 'purchase_not_resumable', 'This checkout can no longer be resumed. Start a new purchase.', 409, false)
  const payment = { ...calculateOrganizationPayment(Number(pkg.price_cents)), currency: 'usd' as const }
  const recurring = pkg.billing_type === 'recurring'

  if (purchase.stripe_checkout_session_id) {
    const prior = await stripe.checkout.sessions.retrieve(purchase.stripe_checkout_session_id).catch(() => null)
    if (prior?.status === 'open' && prior.url) {
      const payload = canonicalCheckoutResponse({ payload: { checkout_url: assertStripeHostedUrl(prior.url), purchase_id: purchase.id,
        expires_at: new Date(prior.expires_at * 1000).toISOString(), reused: true, fee_breakdown: payment }, requestId,
        checkoutType: 'training_package', checkoutRecordId: purchase.id })
      return checkoutJson(payload, requestId)
    }
    if (prior?.status === 'complete') {
      try {
        await fulfillMobileCheckoutSession(prior)
        const { data: reconciled } = await supabaseAdmin.from('org_training_package_purchases').select('status')
          .eq('id', purchase.id).maybeSingle()
        if (['active','paid'].includes(String(reconciled?.status))) {
          return checkoutJson(canonicalCheckoutResponse({ payload: { purchase_id: purchase.id,
            status: reconciled!.status, checkout_required: false, reconciled: true }, requestId,
          checkoutType: 'training_package', checkoutRecordId: purchase.id }), requestId)
        }
      } catch (reconcileError) {
        safePaymentError('[training-packages/purchase] reconciliation failed', reconcileError, {
          request_id: requestId, purchase_id: purchase.id, stripe_checkout_session_id: prior.id,
        })
      }
      return fail(requestId, 'payment_confirmation_unavailable', 'Payment confirmation is temporarily unavailable. Please try again.', 503, true)
    }
    await supabaseAdmin.from('org_training_package_purchases').update({
      stripe_checkout_session_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', purchase.id).eq('status', 'pending')
  }

  const live = String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')
  let connect = await loadStripeConnectAccountStatus('org', purchase.org_id).catch(error => {
    safePaymentError('[training-packages/purchase] stored Connect lookup failed', error, {
      request_id: requestId, purchase_id: purchase.id, org_id: purchase.org_id,
    })
    return null
  })
  // Stored Connect flags are a fast path, but older rows can have a stale
  // livemode value from before environment attribution was persisted. Refresh
  // Stripe whenever readiness OR environment does not match so a valid live
  // account is not rejected before Checkout is created.
  if (!isStripeConnectEnabled(connect) || Boolean(connect?.livemode) !== live) {
    connect = await loadStripeConnectAccountStatus('org', purchase.org_id, { refresh: true }).catch(error => {
      safePaymentError('[training-packages/purchase] Connect refresh failed', error, {
        request_id: requestId, purchase_id: purchase.id, org_id: purchase.org_id,
      })
      return null
    })
  }
  if (!isStripeConnectEnabled(connect)) {
    console.warn('[training-packages/purchase] rejected', { request_id: requestId, purchase_id: purchase.id,
      org_id: purchase.org_id, code: 'connect_setup_incomplete', retryable: false })
    return fail(requestId, 'connect_setup_incomplete', 'This organization is still setting up payments.', 409, false)
  }
  if (Boolean(connect?.livemode) !== live) {
    console.warn('[training-packages/purchase] rejected', { request_id: requestId, purchase_id: purchase.id,
      org_id: purchase.org_id, code: 'stripe_environment_mismatch', retryable: false })
    return fail(requestId, 'stripe_environment_mismatch', 'Payments are unavailable in this environment.', 409, false)
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', user.id).maybeSingle()
  const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('id')
    .eq('workspace_type', 'organization').eq('organization_id', purchase.org_id).eq('status', 'active')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!workspace) {
    console.warn('[training-packages/purchase] rejected', { request_id: requestId, purchase_id: purchase.id,
      org_id: purchase.org_id, code: 'workspace_unavailable', retryable: false })
    return fail(requestId, 'workspace_unavailable', 'The organization workspace is unavailable.', 409, false)
  }
  let customerId = profile?.stripe_customer_id || null
  try {
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, metadata: { coaches_hive_user_id: user.id } }, { idempotencyKey: `training-customer:${user.id}` })
      customerId = customer.id
      const { error } = await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
      if (error) throw error
    }
    const interval: 'month' | 'year' = pkg.billing_interval === 'year' ? 'year' : 'month'
    const metadata = {
      source: 'org_training_package', checkout_type: 'training_package', request_id: requestId,
      purchase_id: purchase.id, payment_record_id: purchase.id, package_id: pkg.id,
      source_record_id: purchase.id, title: pkg.name, description: pkg.name,
      athlete_id: athleteId, athlete_profile_id: athleteId, payer_user_id: user.id, org_id: purchase.org_id,
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
    const expiresAt = new Date(session.expires_at * 1000).toISOString()
    const payload = canonicalCheckoutResponse({ payload: { checkout_url: assertStripeHostedUrl(session.url), purchase_id: purchase.id,
      expires_at: expiresAt, fee_breakdown: payment }, requestId, checkoutType: 'training_package', checkoutRecordId: purchase.id })
    await recordCheckoutAttempt({ buyerUserId: user.id, idempotencyKey: resolvedKey.key, requestId,
      checkoutType: 'training_package', checkoutRecordId: purchase.id, purchaseId: purchase.id,
      athleteProfileId: athleteId, workspaceId: workspace.id, organizationId: purchase.org_id,
      offeringType: 'training_package', offeringId: packageId, billingType: recurring ? 'recurring' : 'one_time',
      amountCents: payment.total_cents, stripeCheckoutSessionId: session.id, expiresAt, status: 'checkout_pending' })
    return checkoutJson(payload, requestId)
  } catch (error) {
    safePaymentError('[training-packages/purchase] failed', error, { request_id: requestId, purchase_id: purchaseId, org_id: purchase.org_id })
    return fail(requestId, 'checkout_unavailable', 'Unable to start training package checkout.', 502, true)
  }
}
