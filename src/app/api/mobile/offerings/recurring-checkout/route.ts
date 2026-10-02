import { NextResponse } from 'next/server'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { calculateOrganizationPayment, organizationCheckoutLineItems, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'
import { normalizeOfferingBilling } from '@/lib/offeringBilling'
import { assertStripeHostedUrl, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { idempotencyKeyFor, requestIdFor } from '@/lib/requestSecurity'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const fail = (code: string, message: string, status: number, retryable = status >= 500) =>
  NextResponse.json({ error: { code, message, retryable } }, { status, headers: { 'Cache-Control': 'no-store' } })

type LoadedOffering = { title: string; amountCents: number; interval: 'month' | 'year'; registrationId: string | null }

async function loadOffering(input: { type: string; id: string; orgId: string; athleteId: string; registrationId: string | null; userId: string }): Promise<LoadedOffering | null> {
  if (['program', 'camp', 'clinic', 'league'].includes(input.type)) {
    const { data } = await supabaseAdmin.from('programs').select('id,org_id,name,type,price,billing_type,billing_interval,status')
      .eq('id', input.id).eq('org_id', input.orgId).eq('status', 'active').maybeSingle()
    if (!data || (data.type && String(data.type) !== input.type && input.type !== 'program')) return null
    const { data: registration } = await supabaseAdmin.from('program_registrations').select('id,owner_user_id,athlete_profile_id,status')
      .eq('id', input.registrationId || '').eq('program_id', data.id).maybeSingle()
    if (!registration || registration.owner_user_id !== input.userId || registration.athlete_profile_id !== input.athleteId || registration.status !== 'pending') return null
    const amountCents = Math.round(Number(data.price || 0) * 100)
    const billing = normalizeOfferingBilling(data.billing_type, data.billing_interval, amountCents)
    if (billing.billingType !== 'recurring' || !billing.billingInterval) return null
    return { title: data.name || 'Program registration', amountCents, interval: billing.billingInterval, registrationId: registration.id }
  }
  if (input.type === 'tryout') {
    const { data } = await supabaseAdmin.from('org_tryouts').select('id,org_id,title,price,billing_type,billing_interval,status')
      .eq('id', input.id).eq('org_id', input.orgId).in('status', ['open', 'published', 'active']).maybeSingle()
    if (!data) return null
    const { data: registration } = await supabaseAdmin.from('org_tryout_registrations').select('id,owner_user_id,athlete_profile_id,status')
      .eq('id', input.registrationId || '').eq('tryout_id', data.id).maybeSingle()
    if (!registration || registration.owner_user_id !== input.userId || registration.athlete_profile_id !== input.athleteId || registration.status !== 'pending') return null
    const amountCents = Math.round(Number(data.price || 0) * 100)
    const billing = normalizeOfferingBilling(data.billing_type, data.billing_interval, amountCents)
    if (billing.billingType !== 'recurring' || !billing.billingInterval) return null
    return { title: data.title || 'Tryout registration', amountCents, interval: billing.billingInterval, registrationId: registration.id }
  }
  if (input.type === 'marketplace_product') {
    const { data } = await supabaseAdmin.from('marketplace_items').select('id,org_id,name,price,billing_type,billing_interval,is_active,inventory_count')
      .eq('id', input.id).eq('org_id', input.orgId).eq('is_active', true).maybeSingle()
    if (!data || (data.inventory_count != null && Number(data.inventory_count) <= 0)) return null
    const amountCents = Math.round(Number(data.price || 0) * 100)
    const billing = normalizeOfferingBilling(data.billing_type, data.billing_interval, amountCents)
    if (billing.billingType !== 'recurring' || !billing.billingInterval) return null
    return { title: data.name || 'Marketplace subscription', amountCents, interval: billing.billingInterval, registrationId: null }
  }
  if (input.type === 'session') {
    const { data } = await supabaseAdmin.from('sessions').select('id,org_id,title,price,price_cents,billing_type,billing_interval,status,start_time')
      .eq('id', input.id).eq('org_id', input.orgId).in('status', ['available', 'open', 'scheduled']).maybeSingle()
    if (!data || (data.start_time && new Date(data.start_time).getTime() <= Date.now())) return null
    const amountCents = Math.round(Number(data.price_cents || Number(data.price || 0) * 100))
    const billing = normalizeOfferingBilling(data.billing_type, data.billing_interval, amountCents)
    if (billing.billingType !== 'recurring' || !billing.billingInterval) return null
    return { title: data.title || 'Session subscription', amountCents, interval: billing.billingInterval, registrationId: null }
  }
  return null
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return fail('UNAUTHORIZED', 'Authentication is required.', 401, false)
  const body = await request.json().catch(() => ({}))
  const offeringType = String(body.offering_type || '').trim().toLowerCase()
  const offeringId = normalizeUuid(body.offering_id)
  const orgId = normalizeUuid(body.organization_id)
  const athleteId = normalizeUuid(body.athlete_profile_id)
  const registrationId = normalizeUuid(body.registration_id)
  if (!offeringId || !orgId || !athleteId) return fail('INVALID_REQUEST', 'Offering, organization, and athlete are required.', 422, false)
  const key = idempotencyKeyFor(request, body)
  if ('error' in key) return fail('IDEMPOTENCY_KEY_REQUIRED', 'A valid idempotency key is required.', 422, false)
  if (!(await enforcePaymentRateLimit(user.id, 'recurring_offering_checkout', 8, 60).catch(() => false))) {
    return fail('RATE_LIMITED', 'Too many checkout requests. Please try again shortly.', 429, true)
  }
  const athlete = await resolveAuthorizedAthleteContext(user.id, athleteId)
  if (!athlete) return fail('ATHLETE_PROFILE_UNAVAILABLE', 'Athlete profile is unavailable.', 404, false)
  const [{ data: workspace }, offering] = await Promise.all([
    supabaseAdmin.from('business_workspaces').select('id').eq('workspace_type', 'organization').eq('organization_id', orgId).eq('status', 'active').maybeSingle(),
    loadOffering({ type: offeringType, id: offeringId, orgId, athleteId: athlete.profileId, registrationId, userId: user.id }),
  ])
  if (!workspace || !offering) return fail('OFFERING_UNAVAILABLE', 'This recurring offering is unavailable.', 404, false)
  const connect = await loadStripeConnectAccountStatus('org', orgId, { refresh: true }).catch(() => null)
  if (!isStripeConnectEnabled(connect)) return fail('CONNECT_SETUP_INCOMPLETE', 'This organization is still setting up payments.', 409, false)

  const { data: prior } = await supabaseAdmin.from('offering_recurring_subscriptions').select('*')
    .eq('athlete_profile_id', athlete.profileId).eq('offering_type', offeringType === 'marketplace_product' ? 'marketplace_product' : offeringType === 'tryout' ? 'tryout' : offeringType === 'session' ? 'session' : 'program')
    .eq('offering_id', offeringId).in('status', ['checkout_pending', 'trialing', 'active', 'past_due', 'paused', 'incomplete']).maybeSingle()
  if (prior?.stripe_checkout_session_id && prior.status === 'checkout_pending') {
    const existing = await stripe.checkout.sessions.retrieve(prior.stripe_checkout_session_id).catch(() => null)
    if (existing?.status === 'open' && existing.url) return NextResponse.json({ checkout_url: assertStripeHostedUrl(existing.url), subscription_record_id: prior.id, expires_at: new Date(existing.expires_at * 1000).toISOString(), reused: true })
  }
  if (prior && prior.status !== 'checkout_pending') return fail('ALREADY_ENROLLED', 'This athlete already has this recurring offering.', 409, false)

  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', user.id).maybeSingle()
    let customerId = profile?.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, metadata: { coaches_hive_user_id: user.id } }, { idempotencyKey: `offering-customer:${user.id}` })
      customerId = customer.id
      const { error } = await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
      if (error) throw error
    }
    const normalizedType = offeringType === 'marketplace_product' ? 'marketplace_product' : offeringType === 'tryout' ? 'tryout' : offeringType === 'session' ? 'session' : 'program'
    const recordPayload = { workspace_id: workspace.id, organization_id: orgId, athlete_profile_id: athlete.profileId,
      purchaser_user_id: user.id, offering_type: normalizedType, offering_id: offeringId, registration_id: offering.registrationId,
      billing_interval: offering.interval, amount_cents: offering.amountCents, status: 'checkout_pending', updated_at: new Date().toISOString() }
    const recordResult = prior
      ? await supabaseAdmin.from('offering_recurring_subscriptions').update(recordPayload).eq('id', prior.id).select('id').single()
      : await supabaseAdmin.from('offering_recurring_subscriptions').insert(recordPayload).select('id').single()
    if (recordResult.error || !recordResult.data) throw recordResult.error || new Error('Subscription record was not created')
    const payment = calculateOrganizationPayment(offering.amountCents)
    const metadata = { source: 'recurring_offering', checkout_type: `recurring_${normalizedType}`, request_id: requestId,
      offering_subscription_id: recordResult.data.id, offering_type: normalizedType, offering_id: offeringId,
      registration_id: offering.registrationId || '', athlete_profile_id: athlete.profileId, payer_user_id: user.id,
      org_id: orgId, workspace_id: workspace.id, billing_interval: offering.interval,
      payment_record_id: recordResult.data.id, platformFeeCents: String(payment.platform_fee_cents), ...organizationPaymentMetadata(payment) }
    const lines = organizationCheckoutLineItems(offering.title, payment).map(line => ({ ...line,
      price_data: { ...line.price_data, recurring: { interval: offering.interval } } }))
    const feePercent = Number(((payment.application_fee_cents / payment.total_cents) * 100).toFixed(2))
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, payment_method_types: ['card'],
      line_items: lines, client_reference_id: user.id, metadata,
      subscription_data: { application_fee_percent: feePercent, transfer_data: { destination: connect!.stripeAccountId }, metadata },
      success_url: `${resolveBaseUrl()}/mobile/payment-return?status=processing&type=${normalizedType}&subscription_record_id=${recordResult.data.id}`,
      cancel_url: `${resolveBaseUrl()}/mobile/payment-return?status=canceled&type=${normalizedType}&subscription_record_id=${recordResult.data.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60 },
    { idempotencyKey: `recurring-offering:${recordResult.data.id}:${key.key}` })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    const { error: bindError } = await supabaseAdmin.from('offering_recurring_subscriptions').update({
      stripe_customer_id: customerId, stripe_checkout_session_id: session.id, updated_at: new Date().toISOString(),
    }).eq('id', recordResult.data.id).eq('status', 'checkout_pending')
    if (bindError) throw bindError
    return NextResponse.json({ checkout_url: assertStripeHostedUrl(session.url), subscription_record_id: recordResult.data.id,
      expires_at: new Date(session.expires_at * 1000).toISOString(), fee_breakdown: payment }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    safePaymentError('[mobile/offerings/recurring-checkout] failed', error, { request_id: requestId, user_id: user.id, organization_id: orgId, offering_type: offeringType, offering_id: offeringId })
    return fail('CHECKOUT_UNAVAILABLE', 'Unable to start recurring checkout.', 502, true)
  }
}
