import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSessionReminderEmail } from '@/lib/email'

export const runtime = 'nodejs'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET
  if (secret) {
    const header = request.headers.get('x-reminder-secret')
    if (!header || header !== secret) {
      return jsonError('Unauthorized', 401)
    }
  }

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
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', profileIds)
    : { data: [] }
  const profileMap = new Map((profiles || []).map((row: any) => [row.id, row]))

  let sent = 0
  for (const session of reminderEligibleSessions) {
    const coachProfile = profileMap.get(session.coach_id)
    const athleteProfile = profileMap.get(session.athlete_id)
    const recipients = [
      coachProfile?.email
        ? {
            email: coachProfile.email,
            name: coachProfile.full_name,
            coachName: coachProfile.full_name,
            dashboardUrl: '/coach/calendar',
          }
        : null,
      athleteProfile?.email
        ? {
            email: athleteProfile.email,
            name: athleteProfile.full_name,
            coachName: coachProfile?.full_name,
            dashboardUrl: '/athlete/calendar',
          }
        : null,
    ].filter(Boolean) as Array<{ email: string; name?: string | null; coachName?: string | null; dashboardUrl: string }>

    for (const recipient of recipients) {
      const { data: existing } = await supabaseAdmin
        .from('email_deliveries')
        .select('id')
        .eq('template', 'session_reminder')
        .eq('to_email', recipient.email)
        .contains('metadata', { session_id: session.id })
        .maybeSingle()

      if (existing) continue

      await sendSessionReminderEmail({
        toEmail: recipient.email,
        toName: recipient.name,
        coachName: recipient.coachName,
        startTime: session.start_time,
        location: session.location,
        sessionId: session.id,
        dashboardUrl: recipient.dashboardUrl,
      })
      sent += 1
    }
  }

  return NextResponse.json({ sent, window_start: windowStart.toISOString(), window_end: windowEnd.toISOString() })
}
