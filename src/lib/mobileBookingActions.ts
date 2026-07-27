import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type MobileBookingRow = {
  id: string
  coach_id: string
  athlete_id: string
  payment_assignment_id?: string | null
  booking_type?: string | null
  session_type?: string | null
  status?: string | null
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
  location?: string | null
  payment_intent_id?: string | null
}

export const loadOwnedMobileBooking = async (bookingId: string, userId: string) => {
  const { data: booking, error } = await supabaseAdmin
    .from('sessions')
    .select('id, coach_id, athlete_id, payment_assignment_id, booking_type, session_type, status, start_time, end_time, duration_minutes, location, payment_intent_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw error
  if (!booking) return null

  let isAthleteOwner = booking.athlete_id === userId
  if (!isAthleteOwner && booking.athlete_id) {
    const { data: athlete } = await supabaseAdmin
      .from('athlete_profiles')
      .select('id')
      .eq('id', booking.athlete_id)
      .eq('owner_user_id', userId)
      .maybeSingle()
    isAthleteOwner = Boolean(athlete)
  }
  if (booking.coach_id !== userId && !isAthleteOwner) return null
  return {
    booking: booking as MobileBookingRow,
    actor: booking.coach_id === userId ? 'coach' as const : 'athlete' as const,
  }
}

export const bookingResponse = ({
  booking,
  capacityReleased,
  paymentStatus,
  refundStatus,
}: {
  booking: MobileBookingRow
  capacityReleased: boolean
  paymentStatus: string | null
  refundStatus: string | null
}) => ({
  booking_id: booking.id,
  booking_status: String(booking.status || '').toLowerCase(),
  released_capacity: capacityReleased,
  payment_status: paymentStatus,
  refund_status: refundStatus,
  session: booking,
})
