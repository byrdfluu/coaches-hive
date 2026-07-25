import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'
import { isPushEnabled } from '@/lib/notificationPrefs'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['coach', 'assistant_coach', 'admin']

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const payload = await request.json().catch(() => ({}))
  const source = String(payload?.source || '').trim().toLowerCase()
  const message = String(payload?.message || '').trim()
  const requestedCoachId = String(payload?.coach_id || '').trim()
  const sessionTitle = String(payload?.title || '').trim()
  const sessionDate = String(payload?.date || '').trim()
  const sessionTime = String(payload?.time || '').trim()
  const sessionNotes = String(payload?.notes || '').trim()
  const sessionLocation = String(payload?.location || '').trim()
  const sessionType = String(payload?.type || '').trim()

  const coachId = role === 'admin' ? requestedCoachId : session.user.id
  if (!coachId) {
    return jsonError('coach_id is required')
  }

  const { data: coachProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('id', coachId)
    .maybeSingle()

  const { data: linkedRows } = await supabaseAdmin
    .from('coach_athlete_links')
    .select('athlete_id')
    .eq('coach_id', coachId)
    .eq('status', 'active')

  const athleteIds = Array.from(
    new Set((linkedRows || []).map((row) => row.athlete_id).filter(Boolean)),
  ) as string[]

  if (!athleteIds.length) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  const { data: athleteProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, notification_prefs')
    .in('id', athleteIds)

  const category = source === 'calendar' ? 'sessions' : 'messages'
  const actionUrl = source === 'calendar' ? '/athlete/calendar' : '/athlete/messages'
  const coachName = coachProfile?.full_name || 'Your coach'
  const pushTitle =
    source === 'calendar'
      ? 'Schedule update from your coach'
      : 'Message from your coach'

  // Build a human-readable date/time string
  const formattedDate = sessionDate
    ? new Date(`${sessionDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const formattedTime = sessionTime
    ? new Date(`2000-01-01T${sessionTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  // Compose rich push body — same detail level as the email so the in-app notification is self-contained
  const pushParts: string[] = []
  if (sessionTitle) pushParts.push(sessionTitle)
  if (formattedDate) pushParts.push(`📅 ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ''}`)
  if (sessionLocation) pushParts.push(`📍 ${sessionLocation}`)
  if (sessionNotes) pushParts.push(sessionNotes)
  const pushBody = pushParts.length ? pushParts.join('\n') : (message || `Update from ${coachName}.`)

  const pushRows = (athleteProfiles || [])
    .filter((profile) => isPushEnabled(profile.notification_prefs, category))
    .map((profile) => ({
      user_id: profile.id,
      type: 'coach_broadcast',
      title: pushTitle,
      body: pushBody,
      action_url: actionUrl,
      data: {
        category: source === 'calendar' ? 'Sessions' : 'Messages',
        source: source || 'coach_portal',
        coach_id: coachId,
        coach_name: coachName,
        session_title: sessionTitle || null,
        session_type: sessionType || null,
        formatted_date: formattedDate || null,
        formatted_time: formattedTime || null,
        location: sessionLocation || null,
        notes: sessionNotes || null,
      },
    }))

  if (pushRows.length) {
    const { error: pushError } = await insertNotifications(pushRows)
    if (pushError) {
      return jsonError(pushError.message, 500)
    }
  }

  return NextResponse.json({ ok: true, count: pushRows.length })
}
