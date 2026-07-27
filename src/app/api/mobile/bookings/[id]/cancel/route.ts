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

  const body = await request.json().catch(() => ({}))
  const reason = String(body?.reason || 'Booking canceled in the Coaches Hive app').trim()
  const currentStatus = String(owned.booking.status || '').toLowerCase()
  if (['completed', 'refunded'].includes(currentStatus)) {
    return jsonError('Booking can no longer be canceled', 409)
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('sessions')
    .update({
      status: 'canceled',
      cancellation_reason: reason.slice(0, 1000),
      canceled_at: now,
      canceled_by: user.id,
      updated_at: now,
    })
    .eq('id', id)
    .not('status', 'in', '("completed","refunded")')
    .select('id, coach_id, athlete_id, payment_assignment_id, booking_type, session_type, status, start_time, end_time, duration_minutes, location, payment_intent_id')
    .single()
  if (error) return jsonError('Unable to cancel booking', 500)

  let paymentStatus: string | null = null
  let refundStatus: string | null = null
  let assignmentCanceled = false
  if (updated.payment_assignment_id) {
    const { data: assignment } = await supabaseAdmin
      .from('coach_fee_assignments')
      .select('id, status, amount, athlete_id')
      .eq('id', updated.payment_assignment_id)
      .single()
    if (assignment) {
      paymentStatus = assignment.status || null
      const { error: assignmentCancelError } = await supabaseAdmin
        .from('coach_fee_assignments')
        .update({
          status: 'canceled',
          booking_status: 'canceled',
          canceled_at: now,
          canceled_by: user.id,
          cancellation_reason: reason.slice(0, 1000),
          updated_at: now,
        })
        .eq('id', assignment.id)
      assignmentCanceled = !assignmentCancelError
    }

    if (assignment && String(assignment.status).toLowerCase() === 'paid') {
      const { data: athlete } = await supabaseAdmin
        .from('athlete_profiles')
        .select('owner_user_id')
        .eq('id', assignment.athlete_id)
        .maybeSingle()
      const requesterId = athlete?.owner_user_id || user.id
      const { data: existing } = await supabaseAdmin
        .from('payment_refund_requests')
        .select('id, status')
        .eq('payment_type', 'coach_fee')
        .eq('payment_record_id', assignment.id)
        .in('status', ['requested', 'under_review', 'approved', 'processing'])
        .maybeSingle()
      if (existing) {
        refundStatus = existing.status
      } else {
        const { data: created } = await supabaseAdmin
          .from('payment_refund_requests')
          .insert({
            requester_id: requesterId,
            athlete_id: assignment.athlete_id,
            payment_type: 'coach_fee',
            payment_record_id: assignment.id,
            amount: assignment.amount,
            reason: reason.length >= 10 ? reason : 'Paid coach booking was canceled',
            status: 'requested',
          })
          .select('status')
          .single()
        refundStatus = created?.status || 'requested'
      }
    }
  }

  const kind = String(updated.booking_type || updated.session_type || '').toLowerCase()
  return NextResponse.json(bookingResponse({
    booking: updated,
    capacityReleased: assignmentCanceled && ['group', 'camp'].includes(kind),
    paymentStatus,
    refundStatus,
  }))
}
