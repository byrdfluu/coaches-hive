import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { emitTenantEvent, organizationNotificationContext } from '@/lib/notificationProducers'

export type MobileBookingRow = {
  id: string
  coach_id: string
  athlete_id: string
  athlete_profile_id?: string | null
  org_id?: string | null
  team_id?: string | null
  workspace_id?: string | null
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
    .select('id, coach_id, athlete_id, athlete_profile_id, org_id, team_id, workspace_id, payment_assignment_id, booking_type, session_type, status, start_time, end_time, duration_minutes, location, payment_intent_id')
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

export async function notifyMobileBookingChange(input: {
  booking: MobileBookingRow
  actorUserId: string
  event: 'canceled' | 'rescheduled'
  occurredAt: string
}) {
  const { booking } = input
  const athleteProfileId = booking.athlete_profile_id || booking.athlete_id || null
  const [{ data: athleteProfile }, { data: guardianRows }] = await Promise.all([
    athleteProfileId
      ? supabaseAdmin.from('athlete_profiles').select('id,owner_user_id,full_name').eq('id', athleteProfileId).maybeSingle()
      : Promise.resolve({ data: null }),
    athleteProfileId
      ? supabaseAdmin.from('athlete_guardian_invitations').select('accepted_by')
        .eq('athlete_id', athleteProfileId).eq('status', 'accepted').not('accepted_by', 'is', null)
      : Promise.resolve({ data: [] }),
  ])

  let workspaceId = booking.workspace_id || null
  if (workspaceId) {
    const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('id,status,organization_id,owner_user_id')
      .eq('id', workspaceId).eq('status', 'active').maybeSingle()
    if (!workspace || (booking.org_id && workspace.organization_id !== booking.org_id)) workspaceId = null
  }
  if (!workspaceId && booking.org_id) {
    workspaceId = (await organizationNotificationContext(booking.org_id)).workspaceId
  }
  if (!workspaceId && booking.coach_id) {
    const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('id')
      .eq('owner_user_id', booking.coach_id).eq('status', 'active').limit(1).maybeSingle()
    workspaceId = workspace?.id || null
  }

  const familyRecipients = Array.from(new Set([
    athleteProfile?.owner_user_id,
    ...((guardianRows || []).map(row => row.accepted_by)),
    athleteProfile ? null : booking.athlete_id,
  ].filter(Boolean) as string[])).filter(id => id !== input.actorUserId)
  const coachRecipients = booking.coach_id && booking.coach_id !== input.actorUserId ? [booking.coach_id] : []
  const type = input.event === 'canceled' ? 'booking_canceled' : 'schedule_changed'
  const title = input.event === 'canceled' ? 'Booking canceled' : 'Booking rescheduled'
  const context = { workspaceId, organizationId: booking.org_id || null }
  const shared = {
    type, category: 'schedule', title, body: '', resourceId: booking.id,
    state: `${input.event}:${input.occurredAt}`, context,
    actorUserId: input.actorUserId, athleteProfileId,
    data: {
      booking_id: booking.id, event: input.event, coach_user_id: booking.coach_id,
      athlete_id: athleteProfileId, athlete_profile_id: athleteProfileId,
      subject_name: athleteProfile?.full_name || null, team_id: booking.team_id || null, occurred_at: input.occurredAt,
    },
  }
  const coachBody = input.event === 'canceled'
    ? "{athlete_name}'s booking was canceled. Open your calendar for details."
    : "{athlete_name}'s booking was rescheduled. Open your calendar for details."
  const familyBody = input.event === 'canceled'
    ? "Coach {actor_name} canceled {athlete_name}'s session."
    : "Coach {actor_name} rescheduled {athlete_name}'s session."
  await Promise.all([
    emitTenantEvent({ ...shared, recipientIds: coachRecipients, destination: '/coach/calendar', bodyTemplate: coachBody }),
    emitTenantEvent({ ...shared, recipientIds: familyRecipients, destination: '/athlete/calendar', bodyTemplate: familyBody }),
  ])
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
