import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError, stripeIdempotencyKey } from '@/lib/mobilePaymentApi'
import { loadStripeConnectAccountStatus, isStripeConnectEnabled } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeRecurringFeePayer, RECURRING_FEE_SOURCE } from '@/lib/recurringFees'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { calculateOrganizationPayment, organizationCheckoutLineItems, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'
import { createHash } from 'node:crypto'
import { idempotencyKeyFor, requestFingerprint, requestIdFor } from '@/lib/requestSecurity'
import { canonicalCheckoutResponse, checkoutJson, recordCheckoutAttempt } from '@/lib/checkoutAttempts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'

export async function POST(request: Request) {
  const requestId=requestIdFor(request)
  const fail=(message:string,status=400,retryable=status===429||status>=500)=>mobileError(message,status,retryable,requestId)
  const user = await getMobileRequestUser(request)
  if (!user) return fail('Unauthorized', 401,false)
  const body = await request.json().catch(() => ({}))
  const offerId = String(body.fee_offer_id || '').trim()
  const athleteId = String(body.athlete_id || '').trim()
  const resolvedKey=idempotencyKeyFor(request,body)
  if('error'in resolvedKey)return fail(resolvedKey.error==='conflict'?'Idempotency-Key and idempotency_key must match.':'A valid Idempotency-Key header is required.',resolvedKey.error==='conflict'?409:422,false)
  const idempotencyKey=resolvedKey.key
  const fingerprint=requestFingerprint(body)
  const authorizationAccepted = body.authorization_accepted === true
  const startDate = String(body.start_date || new Date().toISOString().slice(0, 10))
  if (!offerId || !athleteId) return fail('fee_offer_id and athlete_id are required', 422,false)
  if (!authorizationAccepted) return fail('Explicit recurring-payment authorization is required', 422,false)
  const start = new Date(`${startDate}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || start.getTime() < Date.now() - 86_400_000) return fail('start_date must be a current or future ISO date', 422,false)
  if (start.getTime() > Date.now() + 60_000 && start.getTime() <= Date.now() + 48 * 60 * 60 * 1000) return fail('A future start_date must be at least 48 hours from now', 422,false)
  if (!(await enforcePaymentRateLimit(user.id, 'recurring_fee_checkout', 8, 60).catch(() => false))) return fail('Too many payment requests. Try again shortly.', 429,true)

  const { data: existing } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,status,stripe_checkout_session_id,organization_id,athlete_id,offer_id,payer_user_id,request_fingerprint')
    .eq('payer_user_id', user.id).eq('idempotency_key', idempotencyKey).maybeSingle()
  if (existing) {
    if(existing.request_fingerprint&&existing.request_fingerprint!==fingerprint)return fail('This idempotency key was already used with a different request.',409,false)
    if (existing.payer_user_id !== user.id || existing.athlete_id !== athleteId || existing.offer_id !== offerId) {
      return fail('Idempotency key belongs to a different recurring fee request', 409,false)
    }
    const existingAccess = await authorizeRecurringFeePayer(user.id, existing.athlete_id, existing.organization_id)
    if (!existingAccess.ok) return fail(existingAccess.reason, 403,false)
    if (!existing.stripe_checkout_session_id) return fail(`This checkout request is already ${existing.status}`, 409,false)
    const prior = await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id).catch(() => null)
    if (prior?.status === 'open' && prior.url) {
      const payload = canonicalCheckoutResponse({ payload: { fee_id: existing.id, checkout_url: assertStripeHostedUrl(prior.url),
        expires_at: new Date(prior.expires_at * 1000).toISOString(), reused: true }, requestId,
      checkoutType: 'recurring_fee', checkoutRecordId: existing.id })
      return checkoutJson(payload, requestId)
    }
    return fail(`This checkout request is already ${existing.status}`, 409,false)
  }

  let { data: assignment } = await supabaseAdmin.from('organization_recurring_fee_offer_assignments')
    .select('id,status,organization_recurring_fee_offers(*)').eq('offer_id', offerId).eq('athlete_id', athleteId).maybeSingle()
  let rawOffer = assignment?.organization_recurring_fee_offers
  let offer = (Array.isArray(rawOffer) ? rawOffer[0] : rawOffer) as any
  if (!assignment) {
    const { data: selfEnrollmentOffer } = await supabaseAdmin.from('organization_recurring_fee_offers').select('*')
      .eq('id', offerId).eq('status', 'published').eq('self_enrollment_enabled', true).maybeSingle()
    offer = selfEnrollmentOffer as any
  }
  if (!offer || assignment?.status === 'revoked' || offer.status !== 'published') return fail('Recurring fee offer not found or unavailable', 404,false)
  const orgId = String(offer.organization_id)
  const access = await authorizeRecurringFeePayer(user.id, athleteId, orgId)
  if (!access.ok) return fail(access.reason, 403,false)
  if (!assignment) {
    const { data: createdAssignment, error: assignmentError } = await supabaseAdmin.from('organization_recurring_fee_offer_assignments').upsert({
      offer_id: offerId, athlete_id: athleteId, status: 'offered', assigned_by: user.id,
    }, { onConflict: 'offer_id,athlete_id' }).select('id,status').single()
    if (assignmentError || !createdAssignment) return fail('Unable to reserve this recurring plan', 409,false)
    assignment = { ...createdAssignment, organization_recurring_fee_offers: offer } as any
  }
  if (!assignment) return fail('Unable to reserve this recurring plan', 409,false)
  const offerAssignmentId = assignment.id

  const [{ data: settings }, connect, { data: profile }] = await Promise.all([
    supabaseAdmin.from('org_settings').select('org_name,plan_status,recurring_fees_enabled').eq('org_id', orgId).maybeSingle(),
    loadStripeConnectAccountStatus('org', orgId, { refresh: true }).catch(() => null),
    supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', user.id).maybeSingle(),
  ])
  if (!settings?.recurring_fees_enabled || !['active', 'trialing'].includes(String(settings.plan_status || ''))) return fail('Organization cannot create recurring fees', 403,false)
  if (!isStripeConnectEnabled(connect)) return fail('Organization payouts are not ready', 409,false)

  let customerId = profile?.stripe_customer_id || null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, metadata: { user_id: user.id } }, { idempotencyKey: stripeIdempotencyKey('recurring-customer', user.id, idempotencyKey) })
    customerId = customer.id
    const { error } = await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    if (error) return fail('Unable to save Stripe customer', 500,true)
  }
  const snapshot = { offer_id: offer.id, offer_version: offer.version, organization_id: orgId, workspace_id: offer.workspace_id,
    athlete_id: athleteId, amount_cents: offer.amount_cents, currency: offer.currency, interval: offer.interval,
    description: offer.description, cancellation_terms:offer.cancellation_terms||null,refund_terms:offer.refund_terms||null,
    end_date:offer.end_date||null,payment_count:offer.payment_count||null,benefits:offer.benefits||{},stripe_connected_account_id: connect!.stripeAccountId, platform_fee_bps: 400 }
  const paymentContract = calculateOrganizationPayment(Number(offer.amount_cents))
  const authorizationText=`I authorize ${settings?.org_name||'this organization'} and Coaches Hive to charge ${offer.interval} payments of $${(paymentContract.total_cents/100).toFixed(2)}, including a non-refundable service fee of $${(paymentContract.service_fee_cents/100).toFixed(2)} per installment.`
  const { data: fee, error: feeError } = await supabaseAdmin.from('organization_recurring_fees').insert({
    organization_id: orgId, workspace_id: offer.workspace_id, athlete_id: athleteId, payer_user_id: user.id,
    offer_id: offer.id, offer_assignment_id: offerAssignmentId, idempotency_key: idempotencyKey,request_id:requestId,request_fingerprint:fingerprint, immutable_snapshot: snapshot,
    amount_cents: offer.amount_cents, currency: offer.currency, interval: offer.interval, description: offer.description, start_date: startDate,
    platform_fee_bps: 400, stripe_customer_id: customerId, stripe_connected_account_id: connect!.stripeAccountId,
    status: 'checkout_pending', billing_mode: 'scheduled_payment_intent', next_charge_at: start.toISOString(), created_by: user.id,
    authorization_accepted_at:new Date().toISOString(),authorization_user_agent:request.headers.get('user-agent'),
    authorization_ip_hash:createHash('sha256').update(String(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown').split(',')[0].trim()).digest('hex'),
    authorization_text:authorizationText,authorization_version:'2026-09-28',
  }).select('id').single()
  if (feeError || !fee) return fail(feeError?.code === '23505' ? 'Duplicate checkout request' : 'Unable to create recurring fee', feeError?.code === '23505' ? 409 : 500,feeError?.code!=='23505')

  const metadata = { request_id:requestId,source: RECURRING_FEE_SOURCE, recurring_fee_id: fee.id, recurring_offer_id: offer.id,
    org_id: orgId, athlete_id: athleteId, payer_user_id: user.id, workspace_id: offer.workspace_id || '', platform_fee_bps: '400',
    ...organizationPaymentMetadata(paymentContract) }
  try {
    const chargeNow = start.getTime() <= Date.now() + 60_000
    const session = await stripe.checkout.sessions.create({ mode: chargeNow ? 'payment' : 'setup', customer: customerId, payment_method_types: ['card', 'us_bank_account'],
      ...(chargeNow ? {
        line_items: organizationCheckoutLineItems(offer.description, paymentContract),
        payment_intent_data: { setup_future_usage: 'off_session', application_fee_amount: paymentContract.application_fee_cents,
          transfer_data: { destination: connect!.stripeAccountId }, on_behalf_of: connect!.stripeAccountId,
          statement_descriptor_suffix: 'COACHES HIVE', metadata },
      } : { setup_intent_data: { metadata } }),
      consent_collection:{terms_of_service:'required'},custom_text:{submit:{message:authorizationText.slice(0,1200)}},metadata,
      success_url: `${APP_URL}/mobile/payment-return?status=processing&fee_id=${fee.id}`,
      cancel_url: `${APP_URL}/mobile/payment-return?status=canceled&fee_id=${fee.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, { idempotencyKey: stripeIdempotencyKey(`recurring-fee:${offer.id}:${athleteId}`, user.id, idempotencyKey) })
    await supabaseAdmin.from('organization_recurring_fees').update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', fee.id)
    await auditPaymentAction({ actorUserId: user.id, workspaceId: offer.workspace_id, organizationId: orgId,
      action: 'recurring_checkout_created', targetType: 'organization_recurring_fee', targetId: fee.id,
      stripeObjectId: session.id, result: 'succeeded', metadata: { offer_id: offer.id, athlete_id: athleteId } })
    const expiresAt = new Date(session.expires_at * 1000).toISOString()
    const payload = canonicalCheckoutResponse({ payload: { fee_id: fee.id,offer_id:offer.id,
      offer_assignment_id:offerAssignmentId,checkout_url: assertStripeHostedUrl(session.url), expires_at:expiresAt,
      fee_breakdown:paymentContract,frequency:offer.interval,first_charge_date:startDate,end_date:offer.end_date||null,
      payment_count:offer.payment_count||null,cancellation_terms:offer.cancellation_terms||null,
      refund_terms:offer.refund_terms||null,status:'checkout_pending' }, requestId,
    checkoutType:'recurring_fee',checkoutRecordId:fee.id })
    await recordCheckoutAttempt({ buyerUserId:user.id,idempotencyKey,requestId,checkoutType:'recurring_fee',
      checkoutRecordId:fee.id,purchaseId:fee.id,athleteProfileId:athleteId,workspaceId:offer.workspace_id,
      organizationId:orgId,offeringType:'recurring_plan',offeringId:offer.id,billingType:'recurring',
      amountCents:paymentContract.total_cents,stripeCheckoutSessionId:session.id,expiresAt,status:'checkout_pending' })
    return checkoutJson(payload,requestId)
  } catch (error) {
    await supabaseAdmin.from('organization_recurring_fees').update({ status: 'checkout_failed', updated_at: new Date().toISOString() }).eq('id', fee.id)
    safePaymentError('[recurring-fees/start] Stripe checkout failed', error, { fee_id: fee.id, offer_id: offer.id })
    return fail('Unable to start recurring fee checkout', 500,true)
  }
}
