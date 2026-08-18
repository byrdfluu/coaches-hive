import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['coach','athlete','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','admin'])
  if (error || !session) return error
  const { id } = await params
  const { data: booking } = await supabaseAdmin.from('facility_bookings')
    .select('*, facilities(owner_user_id,cancellation_window_hours,late_cancellation_fee_cents), payment_transactions(stripe_payment_intent_id)')
    .eq('id', id).maybeSingle()
  if (!booking) return jsonError('Booking not found', 404)
  const facility = Array.isArray(booking.facilities) ? booking.facilities[0] : booking.facilities
  const transaction = Array.isArray(booking.payment_transactions) ? booking.payment_transactions[0] : booking.payment_transactions
  if (![booking.booked_by_user_id, facility?.owner_user_id].includes(session.user.id)) return jsonError('Forbidden', 403)
  if (!['pending','confirmed'].includes(booking.status)) return jsonError('Booking cannot be canceled', 409)
  const hoursUntil = (new Date(booking.starts_at).getTime() - Date.now()) / 3_600_000
  const cancellationFeeCents = hoursUntil >= Number(facility.cancellation_window_hours) ? 0 : Math.min(Number(booking.amount_cents), Number(facility.late_cancellation_fee_cents || 0))
  const refundCents = Math.max(0, Number(booking.amount_cents) - cancellationFeeCents)
  let refundId: string | null = null
  if (refundCents && transaction?.stripe_payment_intent_id) {
    const refund = await stripe.refunds.create({
      payment_intent: transaction.stripe_payment_intent_id, amount: refundCents,
      refund_application_fee: true, metadata: { booking_id: booking.id, reason: 'facility_cancellation' },
    }, { idempotencyKey: `facility-cancel:${booking.id}:${refundCents}` })
    refundId = refund.id
  }
  await supabaseAdmin.from('facility_bookings').update({
    status: refundCents ? 'refunded' : 'canceled', cancellation_fee_cents: cancellationFeeCents,
    refunded_amount_cents: refundCents, updated_at: new Date().toISOString(),
  }).eq('id', booking.id)
  return NextResponse.json({ status: refundCents ? 'refunded' : 'canceled', refund_id: refundId, refund_amount_cents: refundCents, cancellation_fee_cents: cancellationFeeCents })
}
