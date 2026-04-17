import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isEmailEnabled, isPushEnabled } from '@/lib/notificationPrefs'
import { sendTransactionalEmail } from '@/lib/email'
import { resolveBaseUrl } from '@/lib/siteUrl'

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
    .select('id, full_name, email, notification_prefs')
    .in('id', athleteIds)

  const category = source === 'calendar' ? 'sessions' : 'messages'
  const actionUrl = source === 'calendar' ? '/athlete/calendar' : '/athlete/messages'
  const absoluteActionUrl = `${resolveBaseUrl()}${actionUrl}`
  const coachName = coachProfile?.full_name || 'Your coach'
  const emailSubject =
    source === 'calendar'
      ? `${sessionTitle || 'Schedule update'} from ${coachName}`
      : `Message from ${coachName}`
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

  const bodyParts: string[] = []
  bodyParts.push(`<p><strong>${coachName}</strong> sent you a ${sessionType ? sessionType.toLowerCase() : 'schedule update'}.</p>`)
  if (sessionTitle) bodyParts.push(`<p style="font-size:1.1em;margin:0 0 4px;"><strong>${sessionTitle}</strong></p>`)
  if (formattedDate) bodyParts.push(`<p style="margin:4px 0;">Date: ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ''}</p>`)
  if (sessionLocation) bodyParts.push(`<p style="margin:4px 0;">Location: ${sessionLocation}</p>`)
  if (sessionNotes) bodyParts.push(`<p style="margin:12px 0 0;color:#4a4a4a;">${sessionNotes}</p>`)
  const bodyHtml = bodyParts.join('\n')
  const messagePreview =
    sessionTitle
      ? `${coachName} shared ${sessionTitle}${formattedDate ? ` for ${formattedDate}` : ''}.`
      : `${coachName} sent you a ${sessionType ? sessionType.toLowerCase() : 'schedule update'}.`

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
    const { error: pushError } = await supabaseAdmin.from('notifications').insert(pushRows)
    if (pushError) {
      return jsonError(pushError.message, 500)
    }
  }

  const emailRecipients = (athleteProfiles || []).filter(
    (profile) => profile.email && isEmailEnabled(profile.notification_prefs, category),
  )

  const emailPromises = emailRecipients.map((profile) =>
    sendTransactionalEmail({
      toEmail: profile.email as string,
      toName: profile.full_name || null,
      subject: emailSubject,
      templateAlias: 'coach_broadcast',
      templateModel: {
        email_heading: source === 'calendar' ? 'Schedule update' : 'Message from your coach',
        message_preview: messagePreview,
        cta_label: source === 'calendar' ? 'View calendar' : 'Open messages',
        action_url: absoluteActionUrl,
        dashboard_url: absoluteActionUrl,
        coach_name: coachName,
        session_title: sessionTitle || '',
        session_type: sessionType || '',
        session_date: formattedDate || '',
        session_time: formattedTime || '',
        session_location: sessionLocation || '',
        session_notes: sessionNotes || '',
        body_html: bodyHtml,
      },
      tag: 'coach_broadcast',
      metadata: {
        coach_id: coachId,
        source: source || 'coach_portal',
      },
    }),
  )
  const emailResults = await Promise.allSettled(emailPromises)
  emailResults.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[coach/notify-athletes] email ${i} failed:`, result.reason)
    }
  })

  const notifiedIds = new Set<string>()
  pushRows.forEach((row) => notifiedIds.add(row.user_id))
  emailRecipients.forEach((profile) => notifiedIds.add(profile.id))

  return NextResponse.json({ ok: true, count: notifiedIds.size })
}
