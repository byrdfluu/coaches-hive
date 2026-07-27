import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { bookingResponse, loadOwnedMobileBooking } from '@/lib/mobileBookingActions'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const { id } = await context.params
  const owned = await loadOwnedMobileBooking(id, user.id).catch(() => null)
  if (!owned) return jsonError('Booking not found', 404)

  const kind = String(owned.booking.booking_type || owned.booking.session_type || 'one_on_one').toLowerCase()
  if (['group', 'camp'].includes(kind) && owned.actor !== 'coach') {
    return jsonError('Only the coach can reschedule a group session or camp', 403)
  }
  if (['canceled', 'completed', 'refunded'].includes(String(owned.booking.status || '').toLowerCase())) {
    return jsonError('Booking can no longer be rescheduled', 409)
  }

  const body = await request.json().catch(() => ({}))
  const start = new Date(String(body?.start_time || ''))
  if (Number.isNaN(start.getTime())) return jsonError('Valid start_time is required')
  const duration = Number(body?.duration_minutes || owned.booking.duration_minutes || 60)
  if (!Number.isFinite(duration) || duration <= 0) return jsonError('Invalid duration_minutes')
  const end = body?.end_time
    ? new Date(String(body.end_time))
    : new Date(start.getTime() + duration * 60_000)
  if (Number.isNaN(end.getTime()) || end <= start) return jsonError('Invalid end_time')

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('sessions')
    .update({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: duration,
      rescheduled_from_start_time: owned.booking.start_time,
      rescheduled_at: now,
      rescheduled_by: user.id,
      ...(typeof body?.location === 'string' ? { location: body.location.trim() } : {}),
      updated_at: now,
    })
    .eq('id', id)
    .select('id, coach_id, athlete_id, payment_assignment_id, booking_type, session_type, status, start_time, end_time, duration_minutes, location, payment_intent_id')
    .single()
  if (error) return jsonError('Unable to reschedule booking', 500)

  let paymentStatus: string | null = null
  if (updated.payment_assignment_id) {
    const { data: assignment } = await supabaseAdmin
      .from('coach_fee_assignments')
      .update({ rescheduled_at: now, updated_at: now })
      .eq('id', updated.payment_assignment_id)
      .select('status')
      .maybeSingle()
    paymentStatus = assignment?.status || null
  }

  return NextResponse.json(bookingResponse({
    booking: updated,
    capacityReleased: false,
    paymentStatus,
    refundStatus: null,
  }))
}
