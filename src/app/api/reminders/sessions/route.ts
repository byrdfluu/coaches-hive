import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'

export const runtime = 'nodejs'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const isAuthorizedReminderRequest = (request: Request) => {
  const secret = process.env.REMINDER_CRON_SECRET
  if (secret) {
    const header = request.headers.get('x-reminder-secret')
    if (header && header === secret) return true
  }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    return request.headers.get('authorization') === `Bearer ${cronSecret}`
  }

  return !secret
}

async function sendSessionReminders() {
  const now = new Date()
  const windowStart = new Date(now.getTime() + 30 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: sessions, error } = await supabaseAdmin
    .from('sessions')
    .select('id, coach_id, athlete_id, start_time, location, session_type, status')
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())

  if (error) {
    Sentry.captureException(error)
    return jsonError('Unable to load upcoming sessions', 500)
  }

  const reminderEligibleSessions = (sessions || []).filter((session) => {
    const normalizedStatus = String(session.status || '').trim().toLowerCase()
    return !['canceled', 'cancelled', 'completed'].includes(normalizedStatus)
  })

  const profileIds = Array.from(
    new Set(reminderEligibleSessions.flatMap((session) => [session.coach_id, session.athlete_id]).filter(Boolean))
  ) as string[]
  const { data: profiles } = profileIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', profileIds)
    : { data: [] }
  const profileMap = new Map((profiles || []).map((row: any) => [row.id, row]))

  let sent = 0
  for (const session of reminderEligibleSessions) {
    const coachProfile = profileMap.get(session.coach_id)
    const athleteProfile = profileMap.get(session.athlete_id)
    const recipients = [
      coachProfile?.id
        ? {
            userId: coachProfile.id,
            coachName: coachProfile.full_name,
            dashboardUrl: '/coach/calendar',
          }
        : null,
      athleteProfile?.id
        ? {
            userId: athleteProfile.id,
            coachName: coachProfile?.full_name,
            dashboardUrl: '/athlete/calendar',
          }
        : null,
    ].filter(Boolean) as Array<{ userId: string; coachName?: string | null; dashboardUrl: string }>

    for (const recipient of recipients) {
      const { data: existing } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', recipient.userId)
        .eq('type', 'session_reminder')
        .contains('data', { session_id: session.id })
        .maybeSingle()

      if (existing) continue

      const start = new Date(session.start_time)
      const when = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      await insertNotifications({
        user_id: recipient.userId,
        type: 'session_reminder',
        title: 'Upcoming session',
        body: `Your session${recipient.coachName ? ` with ${recipient.coachName}` : ''} starts ${when}.`,
        action_url: recipient.dashboardUrl,
        data: { category: 'Sessions', session_id: session.id },
      })
      sent += 1
    }
  }

  return NextResponse.json({ sent, window_start: windowStart.toISOString(), window_end: windowEnd.toISOString() })
}

export async function GET(request: Request) {
  if (!isAuthorizedReminderRequest(request)) {
    return jsonError('Unauthorized', 401)
  }
  return sendSessionReminders()
}

export async function POST(request: Request) {
  if (!isAuthorizedReminderRequest(request)) {
    return jsonError('Unauthorized', 401)
  }
  return sendSessionReminders()
}
