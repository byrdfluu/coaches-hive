import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError, requireIdempotencyKey, stripeIdempotencyKey } from '@/lib/mobilePaymentApi'
import { loadStripeConnectAccountStatus, isStripeConnectEnabled } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeRecurringFeePayer, RECURRING_FEE_PLATFORM_PERCENT, RECURRING_FEE_SOURCE } from '@/lib/recurringFees'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401)
  const body = await request.json().catch(() => ({}))
  const offerId = String(body.fee_offer_id || '').trim()
  const athleteId = String(body.athlete_id || '').trim()
  const idempotencyKey = requireIdempotencyKey(body)
  const startDate = String(body.start_date || new Date().toISOString().slice(0, 10))
  if (!offerId || !athleteId || !idempotencyKey) return mobileError('fee_offer_id, athlete_id, and idempotency_key are required', 422)
  const start = new Date(`${startDate}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || start.getTime() < Date.now() - 86_400_000) return mobileError('start_date must be a current or future ISO date', 422)
  if (start.getTime() > Date.now() + 60_000 && start.getTime() <= Date.now() + 48 * 60 * 60 * 1000) return mobileError('A future start_date must be at least 48 hours from now', 422)
  if (!(await enforcePaymentRateLimit(user.id, 'recurring_fee_checkout', 8, 60).catch(() => false))) return mobileError('Too many payment requests. Try again shortly.', 429)

  const { data: existing } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,status,stripe_checkout_session_id,organization_id,athlete_id,offer_id,payer_user_id')
    .eq('payer_user_id', user.id).eq('idempotency_key', idempotencyKey).maybeSingle()
  if (existing) {
    if (existing.payer_user_id !== user.id || existing.athlete_id !== athleteId || existing.offer_id !== offerId) {
      return mobileError('Idempotency key belongs to a different recurring fee request', 409)
    }
    const existingAccess = await authorizeRecurringFeePayer(user.id, existing.athlete_id, existing.organization_id)
    if (!existingAccess.ok) return mobileError(existingAccess.reason, 403)
    if (!existing.stripe_checkout_session_id) return mobileError(`This checkout request is already ${existing.status}`, 409)
    const prior = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id).catch(() => null)
    if (prior?.status === 'open' && prior.url) return NextResponse.json({ fee_id: existing.id, checkout_url: assertStripeHostedUrl(prior.url), expires_at: new Date(prior.expires_at * 1000).toISOString(), reused: true })
    return mobileError(`This checkout request is already ${existing.status}`, 409)
  }

  const { data: assignment } = await supabaseAdmin.from('organization_recurring_fee_offer_assignments')
    .select('id,status,organization_recurring_fee_offers(*)').eq('offer_id', offerId).eq('athlete_id', athleteId).maybeSingle()
  const rawOffer = assignment?.organization_recurring_fee_offers
  const offer = (Array.isArray(rawOffer) ? rawOffer[0] : rawOffer) as any
  if (!assignment || !offer || assignment.status === 'revoked' || offer.status !== 'published') return mobileError('Recurring fee offer not found or unavailable', 404)
  const orgId = String(offer.organization_id)
  const access = await authorizeRecurringFeePayer(user.id, athleteId, orgId)
  if (!access.ok) return mobileError(access.reason, 403)

  const [{ data: settings }, connect, { data: profile }] = await Promise.all([
    supabaseAdmin.from('org_settings').select('org_name,plan_status,recurring_fees_enabled').eq('org_id', orgId).maybeSingle(),
    loadStripeConnectAccountStatus('org', orgId, { refresh: true }).catch(() => null),
    supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', user.id).maybeSingle(),
  ])
  if (!settings?.recurring_fees_enabled || !['active', 'trialing'].includes(String(settings.plan_status || ''))) return mobileError('Organization cannot create recurring fees', 403)
  if (!isStripeConnectEnabled(connect)) return mobileError('Organization payouts are not ready', 409)

  let customerId = profile?.stripe_customer_id || null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, metadata: { user_id: user.id } }, { idempotencyKey: stripeIdempotencyKey('recurring-customer', user.id, idempotencyKey) })
    customerId = customer.id
    const { error } = await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    if (error) return mobileError('Unable to save Stripe customer', 500)
  }
  const snapshot = { offer_id: offer.id, offer_version: offer.version, organization_id: orgId, workspace_id: offer.workspace_id,
    athlete_id: athleteId, amount_cents: offer.amount_cents, currency: offer.currency, interval: offer.interval,
    description: offer.description, stripe_connected_account_id: connect!.stripeAccountId, platform_fee_bps: 400 }
  const { data: fee, error: feeError } = await supabaseAdmin.from('organization_recurring_fees').insert({
    organization_id: orgId, workspace_id: offer.workspace_id, athlete_id: athleteId, payer_user_id: user.id,
    offer_id: offer.id, offer_assignment_id: assignment.id, idempotency_key: idempotencyKey, immutable_snapshot: snapshot,
    amount_cents: offer.amount_cents, currency: offer.currency, interval: offer.interval, description: offer.description, start_date: startDate,
    platform_fee_bps: 400, stripe_customer_id: customerId, stripe_connected_account_id: connect!.stripeAccountId,
    status: 'checkout_pending', created_by: user.id,
  }).select('id').single()
  if (feeError || !fee) return mobileError(feeError?.code === '23505' ? 'Duplicate checkout request' : 'Unable to create recurring fee', feeError?.code === '23505' ? 409 : 500)

  const metadata = { source: RECURRING_FEE_SOURCE, recurring_fee_id: fee.id, recurring_offer_id: offer.id,
    org_id: orgId, athlete_id: athleteId, payer_user_id: user.id, workspace_id: offer.workspace_id || '', platform_fee_bps: '400' }
  try {
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = { metadata, application_fee_percent: RECURRING_FEE_PLATFORM_PERCENT, transfer_data: { destination: connect!.stripeAccountId } }
    if (start.getTime() > Date.now() + 48 * 60 * 60 * 1000) subscriptionData.trial_end = Math.floor(start.getTime() / 1000)
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, payment_method_types: ['card', 'us_bank_account'],
      line_items: [{ quantity: 1, price_data: { currency: offer.currency, unit_amount: Number(offer.amount_cents), recurring: { interval: offer.interval }, product_data: { name: offer.description, metadata: { org_id: orgId, offer_id: offer.id } } } }],
      metadata, subscription_data: subscriptionData,
      success_url: `${APP_URL}/mobile/payment-return?status=processing&fee_id=${fee.id}`,
      cancel_url: `${APP_URL}/mobile/payment-return?status=canceled&fee_id=${fee.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, { idempotencyKey: stripeIdempotencyKey(`recurring-fee:${offer.id}:${athleteId}`, user.id, idempotencyKey) })
    await supabaseAdmin.from('organization_recurring_fees').update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', fee.id)
    await auditPaymentAction({ actorUserId: user.id, workspaceId: offer.workspace_id, organizationId: orgId,
      action: 'recurring_checkout_created', targetType: 'organization_recurring_fee', targetId: fee.id,
      stripeObjectId: session.id, result: 'succeeded', metadata: { offer_id: offer.id, athlete_id: athleteId } })
    return NextResponse.json({ fee_id: fee.id, checkout_url: assertStripeHostedUrl(session.url), expires_at: new Date(session.expires_at * 1000).toISOString() })
  } catch (error) {
    await supabaseAdmin.from('organization_recurring_fees').update({ status: 'checkout_failed', updated_at: new Date().toISOString() }).eq('id', fee.id)
    safePaymentError('[recurring-fees/start] Stripe checkout failed', error, { fee_id: fee.id, offer_id: offer.id })
    return mobileError('Unable to start recurring fee checkout', 500)
  }
}
