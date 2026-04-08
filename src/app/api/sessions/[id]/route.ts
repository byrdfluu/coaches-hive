import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSessionCancellationEmail, sendSessionRescheduledEmail } from '@/lib/email'
import { queueOperationTaskSafely } from '@/lib/operations'
export const dynamic = 'force-dynamic'


const allowedRoles = [
  'coach',
  'athlete',
  'admin',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
]

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, role, error } = await getSessionRole(allowedRoles)
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Session id is required')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return jsonError('Invalid payload')

  const {
    start_time,
    end_time,
    duration_minutes,
    status,
    attendance_status,
    location,
    notes,
    title,
    session_type,
    type,
    practice_plan_id,
  } = body as Record<string, unknown>

  const { data: sessionRow, error: fetchError } = await supabaseAdmin
    .from('sessions')
    .select('id, coach_id, athlete_id, start_time, end_time, duration_minutes, location, session_type')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !sessionRow) {
    return jsonError('Session not found', 404)
  }

  if (role === 'coach' && sessionRow.coach_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }
  if (role === 'athlete' && sessionRow.athlete_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  const updateData: Record<string, unknown> = {}

  if (typeof start_time === 'string' && start_time) {
    const startDate = new Date(start_time)
    if (Number.isNaN(startDate.getTime())) return jsonError('Invalid start_time')
    updateData.start_time = startDate.toISOString()
  }

  if (typeof end_time === 'string' && end_time) {
    const endDate = new Date(end_time)
    if (Number.isNaN(endDate.getTime())) return jsonError('Invalid end_time')
    updateData.end_time = endDate.toISOString()
  }

  if (typeof duration_minutes === 'number' || typeof duration_minutes === 'string') {
    const parsed = Number(duration_minutes)
    if (Number.isNaN(parsed) || parsed <= 0) return jsonError('Invalid duration_minutes')
    updateData.duration_minutes = parsed
  }

  if (typeof status === 'string') updateData.status = status
  if (attendance_status === null) updateData.attendance_status = null
  if (typeof attendance_status === 'string') {
    const normalized = attendance_status.trim().toLowerCase()
    updateData.attendance_status = normalized || null
  }
  if (typeof location === 'string') updateData.location = location
  if (typeof notes === 'string') updateData.notes = notes
  if (typeof title === 'string') updateData.title = title
  if (typeof session_type === 'string') updateData.session_type = session_type
  else if (typeof type === 'string') updateData.session_type = type
  if (practice_plan_id === null) updateData.practice_plan_id = null
  if (typeof practice_plan_id === 'string' && practice_plan_id) {
    updateData.practice_plan_id = practice_plan_id
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError('No updates provided')
  }

  if (updateData.start_time && !updateData.end_time) {
    const duration =
      typeof updateData.duration_minutes === 'number'
        ? (updateData.duration_minutes as number)
        : sessionRow.duration_minutes || 60
    const startDate = new Date(updateData.start_time as string)
    updateData.end_time = new Date(startDate.getTime() + duration * 60 * 1000).toISOString()
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('sessions')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    return jsonError(updateError.message)
  }

  // When a session is rescheduled, notify both parties.
  const isRescheduled = !!(updateData.start_time && status !== 'Canceled' && data)
  if (isRescheduled) {
    const [{ data: coachProfile }, { data: athleteProfile }] = await Promise.all([
      supabaseAdmin.from('profiles').select('full_name, email').eq('id', data.coach_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('full_name, email').eq('id', data.athlete_id).maybeSingle(),
    ])

    const rescheduleEmails: Promise<unknown>[] = []

    if (coachProfile?.email) {
      rescheduleEmails.push(
        sendSessionRescheduledEmail({
          toEmail: coachProfile.email,
          toName: coachProfile.full_name,
          coachName: coachProfile.full_name,
          athleteName: athleteProfile?.full_name,
          newStartTime: data.start_time,
          location: data.location,
          sessionType: data.session_type,
          sessionId: data.id,
          recipientType: 'coach',
        }),
      )
    }

    if (athleteProfile?.email) {
      rescheduleEmails.push(
        sendSessionRescheduledEmail({
          toEmail: athleteProfile.email,
          toName: athleteProfile.full_name,
          coachName: coachProfile?.full_name,
          athleteName: athleteProfile.full_name,
          newStartTime: data.start_time,
          location: data.location,
          sessionType: data.session_type,
          sessionId: data.id,
          recipientType: 'athlete',
        }),
      )
    }

    Promise.allSettled(rescheduleEmails).catch(() => null)
  }

  // When a session is canceled, notify both parties and flag paid sessions for admin refund review.
  if (status === 'Canceled' && data) {
    const [{ data: coachProfile }, { data: athleteProfile }] = await Promise.all([
      supabaseAdmin.from('profiles').select('full_name, email').eq('id', data.coach_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('full_name, email').eq('id', data.athlete_id).maybeSingle(),
    ])

    const emailPromises: Promise<unknown>[] = []

    if (coachProfile?.email) {
      emailPromises.push(
        sendSessionCancellationEmail({
          toEmail: coachProfile.email,
          toName: coachProfile.full_name,
          coachName: coachProfile.full_name,
          athleteName: athleteProfile?.full_name,
          startTime: data.start_time,
          sessionType: data.session_type,
          recipientType: 'coach',
        }),
      )
    }

    if (athleteProfile?.email) {
      emailPromises.push(
        sendSessionCancellationEmail({
          toEmail: athleteProfile.email,
          toName: athleteProfile.full_name,
          coachName: coachProfile?.full_name,
          athleteName: athleteProfile.full_name,
          startTime: data.start_time,
          sessionType: data.session_type,
          recipientType: 'athlete',
        }),
      )
    }

    // If the session was paid, queue a task for admin to review refund eligibility.
    if (data.payment_intent_id) {
      emailPromises.push(
        queueOperationTaskSafely({
          type: 'refund_review',
          title: `Refund review needed — canceled session ${data.id}`,
          priority: 'medium',
          owner: 'Platform Ops',
          entity_type: 'session',
          entity_id: data.id,
          max_attempts: 1,
          idempotency_key: `refund_review:session:${data.id}`,
          metadata: {
            session_id: data.id,
            payment_intent_id: data.payment_intent_id,
            coach_id: data.coach_id,
            athlete_id: data.athlete_id,
            canceled_by_role: role,
          },
        }),
      )
    }

    // Fire-and-forget — do not block the response on email/ops delivery.
    Promise.allSettled(emailPromises).catch(() => null)
  }

  return NextResponse.json({ session: data })
}
