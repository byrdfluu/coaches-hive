import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrgPlatformFeeForOrg } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status })
const key = (parts: unknown[]) => createHash('sha256').update(parts.map(String).join(':')).digest('hex')

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  const body = await request.json().catch(() => ({}))
  const type = String(body.transaction_type || '')
  const recordId = typeof body.record_id === 'string' ? body.record_id : ''
  let amountCents = Math.round(Number(body.amount_cents || 0)), orgId: string | null = null, destination: string | null = null
  let platformFeeCents = 0, stripeFeeCents = 0, netCents = 0, title = 'Coaches Hive payment', metadata: Record<string,string> = {}

  if (type === 'event') {
    const { data: obligation } = await supabaseAdmin.from('org_event_obligations').select('*, org_event_collections(*)').eq('id', recordId).maybeSingle()
    const event = Array.isArray(obligation?.org_event_collections) ? obligation.org_event_collections[0] : obligation?.org_event_collections
    if (!obligation || !event?.active) return error('Event payment request not found', 404)
    const remaining = Math.max(0, Number(obligation.amount_due_cents) - Number(obligation.amount_paid_cents || 0))
    if (amountCents <= 0 || amountCents > remaining) return error('amount_cents must be positive and no greater than the remaining balance')
    orgId = event.org_id; title = event.name; metadata = { obligationId: obligation.id, eventId: event.id, playerId: obligation.player_id || '', teamId: event.team_id || '' }
  } else if (type === 'fundraising') {
    const { data: campaign } = await supabaseAdmin.from('fundraising_campaigns').select('*').eq('id', recordId).eq('active', true).maybeSingle()
    if (!campaign) return error('Campaign not found', 404)
    if (amountCents <= 0 || amountCents > 10_000_000) return error('A valid contribution amount_cents is required')
    orgId = campaign.org_id; title = campaign.name; metadata = {
      campaignId: campaign.id, contributorType: String(body.contributor_type || 'external_individual'),
      contributorName: String(body.contributor_name || ''), contributorEmail: String(body.contributor_email || ''), anonymous: String(Boolean(body.anonymous)),
      taxDeductible: String(Boolean(campaign.is_tax_deductible)),
    }
  } else if (type === 'facility') {
    if (!session?.user) return error('Sign in is required to book a facility', 401)
    const { data: space } = await supabaseAdmin.from('facility_spaces').select('*, facilities(*)').eq('id', recordId).eq('active', true).maybeSingle()
    const facility = Array.isArray(space?.facilities) ? space.facilities[0] : space?.facilities
    const startsAt = new Date(body.starts_at), endsAt = new Date(body.ends_at)
    const duration = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000)
    if (!space || !facility?.active || duration < Number(facility.minimum_minutes) || startsAt.getTime() < Date.now() + Number(facility.advance_notice_hours) * 3_600_000) return error('Invalid or unavailable facility booking')
    amountCents = Math.round(Number(space.hourly_rate_cents) * duration / 60)
    platformFeeCents = Math.min(Math.round(amountCents * Number(facility.marketplace_fee_rate)), Number(facility.marketplace_fee_cap_cents))
    netCents = amountCents - platformFeeCents; destination = facility.stripe_account_id; title = `${facility.name} — ${space.name}`
    const { data: booking, error: bookingError } = await supabaseAdmin.from('facility_bookings').insert({
      facility_id: facility.id, space_id: space.id, booked_by_user_id: session.user.id, booked_by_org_id: body.org_id || null,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), duration_minutes: duration,
      rate_per_hour_cents: space.hourly_rate_cents, amount_cents: amountCents,
    }).select('id').single()
    if (bookingError) return error(bookingError.code === '23P01' ? 'That time slot is no longer available' : bookingError.message, 409)
    metadata = { bookingId: booking.id, facilityId: facility.id, spaceId: space.id, payerId: session.user.id }
  } else return error('transaction_type must be event, facility, or fundraising')

  if (orgId) {
    const connect = await loadStripeConnectAccountStatus('org', orgId)
    if (!isStripeConnectEnabled(connect)) return error('The organization cannot accept payments yet', 409)
    destination = connect!.stripeAccountId
    const fee = await calculateOrgPlatformFeeForOrg({ amountCents, orgId, kind: 'session' })
    platformFeeCents = fee.platformFeeCents; stripeFeeCents = fee.stripeProcessingFeeCents; netCents = fee.netCents
  }
  if (!destination) return error('The payment recipient has not completed Stripe onboarding', 409)
  const payerKey = session?.user.id || metadata.contributorEmail || body.payer_email || 'guest'
  const intent = await stripe.paymentIntents.create({
    amount: amountCents, currency: 'usd', automatic_payment_methods: { enabled: true },
    application_fee_amount: platformFeeCents, transfer_data: { destination },
    metadata: {
      source: `${type}_collection`, transactionType: type, sourceRecordId: recordId, orgId: orgId || '', title,
      amountCents: String(amountCents), platformFeeCents: String(platformFeeCents), stripeProcessingFeeCents: String(stripeFeeCents), netAmountCents: String(netCents), ...metadata,
    },
  }, { idempotencyKey: `core-payment:${key([type, recordId, payerKey, amountCents, body.idempotency_key || 'default'])}` })
  return NextResponse.json({ client_secret: intent.client_secret, payment_intent_id: intent.id, processing_fee_rate: amountCents ? platformFeeCents / amountCents : 0, amount_cents: amountCents, platform_fee_cents: platformFeeCents, stripe_processing_fee_cents: stripeFeeCents, net_cents: netCents, transaction_type: type })
}
