import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const formatIcsDate = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`
}

const escapeIcsText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  let userId: string | null = null
  let userRole: string | null = null

  if (token) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('calendar_feed_token', token)
      .maybeSingle()
    userId = profile?.id ?? null
    userRole = profile?.role ?? null
  } else {
    const supabase = await createRouteHandlerClientCompat()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    userId = session?.user?.id ?? null
    userRole = session?.user ? getSessionRoleState(session.user.user_metadata).currentRole : null
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAthlete = userRole === 'athlete'
  const sessionQuery = supabaseAdmin
    .from('sessions')
    .select('id, title, start_time, end_time, location, notes, coach_id')
    .order('start_time', { ascending: true })

  const { data: sessions, error } = await (isAthlete
    ? sessionQuery.eq('athlete_id', userId)
    : sessionQuery.eq('coach_id', userId))

  if (error) {
    return NextResponse.json({ error: 'Unable to load sessions' }, { status: 500 })
  }

  // For athlete feeds, resolve coach names so the event title is informative.
  let coachNames: Record<string, string> = {}
  if (isAthlete && sessions && sessions.length > 0) {
    const coachIds = Array.from(new Set(sessions.map((s) => s.coach_id).filter(Boolean) as string[]))
    if (coachIds.length > 0) {
      const { data: coaches } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', coachIds)
      ;(coaches || []).forEach((c: { id: string; full_name: string | null }) => {
        if (c.full_name) coachNames[c.id] = c.full_name
      })
    }
  }

  const now = new Date()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Coaches Hive//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
  ]

  ;(sessions || []).forEach((session) => {
    if (!session.start_time) return
    const start = new Date(session.start_time)
    if (Number.isNaN(start.getTime())) return
    const end = session.end_time ? new Date(session.end_time) : new Date(start.getTime() + 60 * 60 * 1000)
    const coachLabel = isAthlete && session.coach_id && coachNames[session.coach_id]
      ? ` w/ ${coachNames[session.coach_id]}`
      : ''
    const summary = escapeIcsText((session.title || 'Training session') + coachLabel)
    const description = escapeIcsText(session.notes || '')
    const location = escapeIcsText(session.location || '')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${session.id}`)
    lines.push(`DTSTAMP:${formatIcsDate(now)}`)
    lines.push(`DTSTART:${formatIcsDate(start)}`)
    lines.push(`DTEND:${formatIcsDate(end)}`)
    lines.push(`SUMMARY:${summary}`)
    if (description) lines.push(`DESCRIPTION:${description}`)
    if (location) lines.push(`LOCATION:${location}`)
    lines.push('END:VEVENT')
  })

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
