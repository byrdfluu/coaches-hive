/**
 * calendarSync.ts
 * Best-effort sync to Google Calendar and Zoom after a session is created.
 * Refreshes expired tokens automatically and updates user_integrations.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type IntegrationRow = {
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  metadata: Record<string, unknown> | null
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function refreshGoogleToken(userId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || ''
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null

  const payload = await res.json()
  if (!payload.access_token) return null

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
    : null

  await supabaseAdmin
    .from('user_integrations')
    .update({ access_token: payload.access_token, expires_at: expiresAt })
    .eq('user_id', userId)
    .eq('provider', 'google')

  return payload.access_token as string
}

async function refreshZoomToken(userId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.ZOOM_OAUTH_CLIENT_ID || ''
  const clientSecret = process.env.ZOOM_OAUTH_CLIENT_SECRET || ''
  if (!clientId || !clientSecret) return null

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    { method: 'POST', headers: { Authorization: `Basic ${basicAuth}` } },
  )
  if (!res.ok) return null

  const payload = await res.json()
  if (!payload.access_token) return null

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
    : null

  await supabaseAdmin
    .from('user_integrations')
    .update({ access_token: payload.access_token, expires_at: expiresAt })
    .eq('user_id', userId)
    .eq('provider', 'zoom')

  return payload.access_token as string
}

async function getValidToken(userId: string, provider: 'google' | 'zoom'): Promise<{
  accessToken: string
  integration: IntegrationRow
} | null> {
  const { data } = await supabaseAdmin
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at, metadata')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle()

  if (!data?.access_token) return null

  const isExpired = data.expires_at ? new Date(data.expires_at) <= new Date(Date.now() + 60_000) : false

  if (isExpired && data.refresh_token) {
    const refreshed = provider === 'google'
      ? await refreshGoogleToken(userId, data.refresh_token)
      : await refreshZoomToken(userId, data.refresh_token)
    if (!refreshed) return null
    return { accessToken: refreshed, integration: data }
  }

  return { accessToken: data.access_token, integration: data }
}

// ─── Google Calendar ───────────────────────────────────────────────────────────

export async function syncGoogleCalendar(params: {
  coachId: string
  sessionId: string
  title: string
  startTime: string
  endTime: string
  location: string | null | undefined
  coachEmail: string | null | undefined
  athleteEmail: string | null | undefined
}): Promise<void> {
  const token = await getValidToken(params.coachId, 'google')
  if (!token) return

  const attendees: Array<{ email: string }> = []
  if (params.coachEmail) attendees.push({ email: params.coachEmail })
  if (params.athleteEmail) attendees.push({ email: params.athleteEmail })

  const body: Record<string, unknown> = {
    summary: params.title || 'Training session',
    start: { dateTime: params.startTime },
    end: { dateTime: params.endTime },
    ...(params.location ? { location: params.location } : {}),
    ...(attendees.length ? { attendees } : {}),
  }

  let syncStatus = 'failed'
  let externalEventId: string | null = null
  let meetingLink: string | null = null

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const event = await res.json()
      externalEventId = event.id || null
      meetingLink = event.hangoutLink || null
      syncStatus = 'synced'
    }
  } catch {
    // best-effort — don't propagate
  }

  const updates: Record<string, unknown> = { sync_status: syncStatus, external_provider: 'google' }
  if (externalEventId) updates.external_event_id = externalEventId
  if (meetingLink) updates.meeting_link = meetingLink

  await supabaseAdmin.from('sessions').update(updates).eq('id', params.sessionId)
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

export async function syncZoomMeeting(params: {
  coachId: string
  sessionId: string
  title: string
  startTime: string
  durationMinutes: number
}): Promise<void> {
  const token = await getValidToken(params.coachId, 'zoom')
  if (!token) return

  const zoomUserId = (token.integration.metadata?.zoom_user_id as string | null) || 'me'

  const body = {
    topic: params.title || 'Training session',
    type: 2, // scheduled meeting
    start_time: params.startTime,
    duration: params.durationMinutes || 60,
    settings: {
      join_before_host: true,
      waiting_room: false,
    },
  }

  let syncStatus = 'failed'
  let externalEventId: string | null = null
  let meetingLink: string | null = null

  try {
    const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(zoomUserId)}/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const meeting = await res.json()
      externalEventId = meeting.id ? String(meeting.id) : null
      meetingLink = meeting.join_url || null
      syncStatus = 'synced'
    }
  } catch {
    // best-effort
  }

  const updates: Record<string, unknown> = { sync_status: syncStatus, external_provider: 'zoom' }
  if (externalEventId) updates.external_event_id = externalEventId
  if (meetingLink) updates.meeting_link = meetingLink

  await supabaseAdmin.from('sessions').update(updates).eq('id', params.sessionId)
}
