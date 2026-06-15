import { NextResponse } from 'next/server'
import { verifyOrgOpportunityPayment } from '@/lib/publicOrgOpportunityPayments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return jsonError('Tryout not found', 404)

  const { data: tryout, error } = await supabaseAdmin
    .from('tryout_events')
    .select('id, org_id, name, sport, age_group, event_date, event_time, max_slots, registration_fee_cents, status, notes, organizations(name)')
    .eq('id', id)
    .maybeSingle()

  if (error) return jsonError('Unable to load tryout', 500)
  if (!tryout) return jsonError('Tryout not found', 404)

  const row = tryout as Record<string, unknown> & {
    organizations?: { name?: string | null }[] | { name?: string | null } | null
  }
  const orgName = Array.isArray(row.organizations)
    ? row.organizations[0]?.name ?? null
    : row.organizations?.name ?? null

  const { count } = await supabaseAdmin
    .from('tryout_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tryout_event_id', id)

  return NextResponse.json({
    tryout: {
      ...tryout,
      organizations: undefined,
      org_name: orgName,
      registration_count: count ?? 0,
    },
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return jsonError('Tryout not found', 404)
  const body = await request.json().catch(() => ({}))
  const athleteName = typeof body?.athlete_name === 'string' ? body.athlete_name.trim() : ''
  const athleteEmail = normalizeEmail(typeof body?.athlete_email === 'string' ? body.athlete_email : '')
  const jerseyNumber = typeof body?.jersey_number === 'string' ? body.jersey_number.trim() : ''

  if (!athleteName) return jsonError('Athlete name is required')
  if (!athleteEmail) return jsonError('Athlete email is required')

  const { data: tryout, error: tryoutError } = await supabaseAdmin
    .from('tryout_events')
    .select('id, org_id, name, status, max_slots, registration_fee_cents')
    .eq('id', id)
    .maybeSingle()

  if (tryoutError) return jsonError('Unable to load tryout', 500)
  if (!tryout) return jsonError('Tryout not found', 404)
  if ((tryout as { status?: string }).status !== 'open') {
    return jsonError('This tryout is not accepting registrations', 410)
  }

  const maxSlots = (tryout as { max_slots?: number | null }).max_slots
  const registrationFeeCents = (tryout as { registration_fee_cents?: number | null }).registration_fee_cents ?? 0
  const { count } = await supabaseAdmin
    .from('tryout_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tryout_event_id', id)

  if (typeof maxSlots === 'number' && maxSlots > 0 && (count ?? 0) >= maxSlots) {
    return jsonError('This tryout is full', 409)
  }

  const { data: existing } = await supabaseAdmin
    .from('tryout_registrations')
    .select('id')
    .eq('tryout_event_id', id)
    .eq('athlete_email', athleteEmail)
    .maybeSingle()

  if (existing) return jsonError('This athlete is already registered for this tryout', 409)

  const paymentIntentId = typeof body?.payment_intent_id === 'string' ? body.payment_intent_id.trim() : ''
  let payment: Awaited<ReturnType<typeof verifyOrgOpportunityPayment>> | null = null
  if (registrationFeeCents > 0) {
    if (!paymentIntentId) return jsonError('Payment is required for this tryout', 402)
    try {
      payment = await verifyOrgOpportunityPayment({
        paymentIntentId,
        expectedAmountCents: registrationFeeCents,
        orgId: (tryout as { org_id: string }).org_id,
        source: 'tryout_registration',
        entityId: id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify tryout payment'
      return jsonError(message, 409)
    }

    const { data: usedPayment } = await supabaseAdmin
      .from('tryout_registrations')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (usedPayment) return jsonError('This payment has already been used for a tryout registration', 409)
  }

  let receiptId: string | null = null
  if (payment) {
    const { data: receipt } = await supabaseAdmin.from('payment_receipts').insert({
      org_id: (tryout as { org_id: string }).org_id,
      amount: payment.amount,
      currency: 'usd',
      status: 'paid',
      stripe_payment_intent_id: payment.intent.id,
      stripe_charge_id: payment.chargeId,
      metadata: {
        source: 'tryout_registration',
        tryout_id: id,
        tryout_name: (tryout as { name?: string | null }).name || null,
        athlete_name: athleteName,
        athlete_email: athleteEmail,
        platform_fee: payment.platformFee,
        platform_fee_rate: payment.feeRate,
        net_amount: payment.netAmount,
        gross_amount: payment.amount,
        org_tier: payment.orgTier,
      },
    }).select('id').maybeSingle()
    receiptId = (receipt as { id?: string } | null)?.id || null
  }

  const registrationPayload = {
    tryout_event_id: id,
    athlete_name: athleteName,
    athlete_email: athleteEmail,
    jersey_number: jerseyNumber || null,
    payment_status: registrationFeeCents > 0 ? 'paid' : 'unpaid',
  }

  let { data: registration, error: dbError } = await supabaseAdmin
    .from('tryout_registrations')
    .insert({
      ...registrationPayload,
      stripe_payment_intent_id: payment?.intent.id || null,
      payment_receipt_id: receiptId,
      paid_at: payment ? new Date().toISOString() : null,
    })
    .select('*')
    .single()

  if (dbError && !payment) {
    const fallback = await supabaseAdmin
      .from('tryout_registrations')
      .insert(registrationPayload)
      .select('*')
      .single()
    registration = fallback.data
    dbError = fallback.error
  }

  if (dbError || !registration) return jsonError('Unable to register for tryout', 500)

  return NextResponse.json({ registration }, { status: 201 })
}
