import { NextResponse } from 'next/server'
import { createOrgOpportunityPaymentIntent } from '@/lib/publicOrgOpportunityPayments'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!isUuid(id)) return jsonError('Tryout not found', 404)

  const body = await request.json().catch(() => ({}))
  const athleteName = typeof body?.athlete_name === 'string' ? body.athlete_name.trim() : ''
  const athleteEmail = typeof body?.athlete_email === 'string' ? body.athlete_email.trim().toLowerCase() : ''
  if (!athleteName) return jsonError('Athlete name is required')
  if (!athleteEmail || !athleteEmail.includes('@')) return jsonError('Valid athlete email is required')

  const { data: tryout, error } = await supabaseAdmin
    .from('tryout_events')
    .select('id, org_id, name, status, max_slots, registration_fee_cents')
    .eq('id', id)
    .maybeSingle()

  if (error) return jsonError('Unable to load tryout', 500)
  if (!tryout) return jsonError('Tryout not found', 404)
  if ((tryout as { status?: string }).status !== 'open') {
    return jsonError('This tryout is not accepting registrations', 410)
  }

  const maxSlots = (tryout as { max_slots?: number | null }).max_slots
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

  try {
    const result = await createOrgOpportunityPaymentIntent({
      amountCents: (tryout as { registration_fee_cents?: number | null }).registration_fee_cents ?? 0,
      orgId: (tryout as { org_id: string }).org_id,
      source: 'tryout_registration',
      entityId: id,
      title: (tryout as { name?: string | null }).name || 'Tryout',
      athleteName,
      athleteEmail,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start payment'
    return jsonError(message, 500)
  }
}
