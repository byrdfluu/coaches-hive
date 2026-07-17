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
  const requestedAthleteProfileId = url.searchParams.get('athlete_profile_id')?.trim() || null
  const requestedOrgId = url.searchParams.get('org_id')?.trim() || null

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
  const isOrgUser = userRole === 'org' || userRole === 'organization' || userRole === 'director'
  let sessionQuery = supabaseAdmin
    .from('sessions')
    .select('id, title, start_time, end_time, location, notes, coach_id, athlete_id')
    .order('start_time', { ascending: true })

  if (isAthlete) {
    const { data: athleteProfiles, error: athleteProfileError } = await supabaseAdmin
      .from('athlete_profiles')
      .select('id')
      .eq('owner_user_id', userId)

    if (athleteProfileError) {
      return NextResponse.json({ error: 'Unable to load athlete profiles' }, { status: 500 })
    }

    const ownedAthleteProfileIds = (athleteProfiles || []).map((profile) => profile.id).filter(Boolean)
    const athleteProfileIds = requestedAthleteProfileId
      ? ownedAthleteProfileIds.includes(requestedAthleteProfileId) ? [requestedAthleteProfileId] : []
      : ownedAthleteProfileIds

    if (athleteProfileIds.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    sessionQuery = sessionQuery.in('athlete_id', athleteProfileIds)
  } else if (isOrgUser && requestedOrgId) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', requestedOrgId)
      .eq('status', 'active')
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: 'Unable to verify organization access' }, { status: 500 })
    }
    if (!membership) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    sessionQuery = sessionQuery.eq('org_id', requestedOrgId)
  } else {
    sessionQuery = sessionQuery.eq('coach_id', userId)
  }

  const { data: sessions, error } = await sessionQuery

  if (error) {
    return NextResponse.json({ error: 'Unable to load sessions' }, { status: 500 })
  }

  // Resolve related names so feed titles are useful.
  let coachNames: Record<string, string> = {}
  if ((isAthlete || isOrgUser) && sessions && sessions.length > 0) {
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
  let athleteNames: Record<string, string> = {}
  if (!isAthlete && sessions && sessions.length > 0) {
    const athleteIds = Array.from(new Set(sessions.map((s) => s.athlete_id).filter(Boolean) as string[]))
    if (athleteIds.length > 0) {
      const { data: athletes } = await supabaseAdmin
        .from('athlete_profiles')
        .select('id, full_name')
        .in('id', athleteIds)
      ;(athletes || []).forEach((athlete: { id: string; full_name: string | null }) => {
        if (athlete.full_name) athleteNames[athlete.id] = athlete.full_name
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
    const athleteLabel = !isAthlete && session.athlete_id && athleteNames[session.athlete_id]
      ? ` - ${athleteNames[session.athlete_id]}`
      : ''
    const summary = escapeIcsText((session.title || 'Training session') + coachLabel + athleteLabel)
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
