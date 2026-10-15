import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { safeOfferingReservationError } from '@/lib/offeringReservations'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, new URL(request.url).searchParams.get('athlete_profile_id'))
  if (!athlete) return jsonError('Athlete access denied.', 403)
  const db = supabaseAdmin as any
  const [{ data: packages, error: packageError }, { data: purchases }, { data: balances, error: balanceError }] = await Promise.all([
    db.from('org_training_packages').select('*').eq('status', 'published').order('created_at', { ascending: false }),
    db.from('org_training_package_purchases').select('*').eq('athlete_id', athlete.profileId).in('status', ['pending', 'active', 'paid', 'past_due', 'cancelled', 'refunded']),
    (supabase as any).rpc('my_credit_balances', { p_athlete_id: athlete.profileId, p_as_of: new Date().toISOString() }),
  ])
  if (packageError) return jsonError('Unable to load training packages.', 500)
  if (balanceError) return jsonError('Unable to load credit balances.', 500)
  const { data: bookings } = await db.from('org_training_session_bookings')
    .select('id,session_id,purchase_id,status,booking_type,credit_returned,cancelled_at,org_training_sessions!inner(id,title,starts_at,ends_at,timezone,location,session_type,status)')
    .eq('athlete_id', athlete.profileId).order('booked_at', { ascending: false })
  const rows = []
  for (const pkg of packages || []) {
    const { data: occurrences, error: occurrenceError } = await (supabase as any).rpc('list_org_training_package_occurrences', {
      p_package_id: pkg.id, p_athlete_id: athlete.profileId, p_from: new Date().toISOString(),
    })
    if (occurrenceError) continue
    const purchase = (purchases || []).find((row: any) => row.package_id === pkg.id && ['active', 'paid', 'past_due'].includes(row.status))
      || (purchases || []).find((row: any) => row.package_id === pkg.id) || null
    const balance = (type: string) => Number((balances || []).find((row: any) => row.ledger_system === 'training'
      && row.product_id === pkg.id && row.credit_type === type)?.credits_remaining || 0)
    rows.push({ ...pkg, occurrences: (occurrences || []).map((row: any) => ({ ...row,
      remaining_spots: Math.max(0, Number(row.capacity) - Number(row.booked_count)) })), purchase,
      group_credits_remaining: balance('group'), one_on_one_credits_remaining: balance('one_on_one'),
      bookings: (bookings || []).filter((row: any) => row.purchase_id === purchase?.id) })
  }
  return NextResponse.json({ packages: rows, athlete_profile_id: athlete.profileId }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, String(body.athlete_profile_id || ''))
  if (!athlete) return jsonError('Athlete access denied.', 403)
  if (body.action === 'book') {
    const sessionIds = Array.isArray(body.session_ids) ? body.session_ids : []
    if (!sessionIds.length) return jsonError('Choose at least one session.', 400)
    const { data, error: bookingError } = await (supabase as any).rpc('book_org_training_sessions_with_credits', {
      p_session_ids: sessionIds, p_athlete_id: athlete.profileId, p_purchase_ids: sessionIds.map(() => body.purchase_id),
    })
    if (bookingError) {
      const safe = safeOfferingReservationError(bookingError)
      return NextResponse.json({ error: { code: safe.code, message: safe.message, retryable: false } }, { status: safe.status })
    }
    return NextResponse.json({ bookings: data || [] })
  }
  if (body.action === 'cancel') {
    const { data, error: cancelError } = await (supabase as any).rpc('cancel_org_training_booking', {
      p_booking_id: body.booking_id, p_reason: String(body.reason || 'Family cancellation'),
    })
    if (cancelError) return jsonError('Booking could not be cancelled.', 409)
    return NextResponse.json({ cancelled: true, credit_returned: Boolean(data) })
  }
  return jsonError('Unsupported training booking action.', 400)
}
