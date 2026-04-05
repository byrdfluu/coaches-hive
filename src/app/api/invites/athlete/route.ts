import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { sendTransactionalEmail } from '@/lib/email'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const normalizeEmail = (value: string) => value.trim().toLowerCase()

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const role = getSessionRoleState(session.user.user_metadata).currentRole
  if (!role || !['coach', 'assistant_coach', 'admin'].includes(role)) {
    return jsonError('Forbidden', 403)
  }

  const payload = await request.json().catch(() => ({}))
  const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
  const emailRaw = typeof payload?.email === 'string' ? payload.email.trim() : ''
  const sport = typeof payload?.sport === 'string' ? payload.sport.trim() : ''
  const location = typeof payload?.location === 'string' ? payload.location.trim() : ''
  const status = typeof payload?.status === 'string' ? payload.status.trim() : ''
  const label = typeof payload?.label === 'string' ? payload.label.trim() : ''
  const notes = typeof payload?.notes === 'string' ? payload.notes.trim() : ''

  if (!emailRaw) {
    return jsonError('Email is required.')
  }

  const inviteEmail = normalizeEmail(emailRaw)
  const coachId = role === 'admin' && typeof payload?.coach_id === 'string' && payload.coach_id.trim()
    ? payload.coach_id.trim()
    : session.user.id

  const [{ data: coachProfile }, { data: athleteProfile }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', coachId)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, notification_prefs')
      .eq('email', inviteEmail)
      .maybeSingle(),
  ])

  if (athleteProfile?.id) {
    const athleteRole = String(athleteProfile.role || '').toLowerCase()
    if (athleteRole && athleteRole !== 'athlete') {
      return jsonError('This email belongs to a non-athlete account.', 409)
    }

    const { data: linkRow, error: linkError } = await supabaseAdmin
      .from('coach_athlete_links')
      .upsert(
        {
          coach_id: coachId,
          athlete_id: athleteProfile.id,
          status: 'active',
        },
        { onConflict: 'coach_id,athlete_id' },
      )
      .select('id')
      .single()

    if (linkError || !linkRow) {
      return jsonError(linkError?.message || 'Unable to link athlete.', 500)
    }

    if (isPushEnabled(athleteProfile.notification_prefs, 'messages')) {
      await supabaseAdmin.from('notifications').insert({
        user_id: athleteProfile.id,
        type: 'coach_invite',
        title: 'Coach invitation',
        body: `${coachProfile?.full_name || 'A coach'} invited you to connect.`,
        action_url: '/athlete/discover',
        data: {
          category: 'Messages',
          coach_id: coachId,
          coach_name: coachProfile?.full_name || null,
          source: 'coach_athletes_add',
        },
      })
    }

    return NextResponse.json({ status: 'linked', athlete_id: athleteProfile.id, link_id: linkRow.id })
  }

  const message = [
    'Invite athlete request',
    name ? `Name: ${name}` : null,
    `Email: ${inviteEmail}`,
    sport ? `Sport: ${sport}` : null,
    location ? `Location: ${location}` : null,
    status ? `Status: ${status}` : null,
    label ? `Label: ${label}` : null,
    notes ? `Notes: ${notes}` : null,
    'Source: Coach athletes add flow',
  ]
    .filter(Boolean)
    .join('\n')

  const now = new Date().toISOString()
  const priority = 'medium'
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const subject = 'Invite athlete'
  const suggestedTemplate = suggestTemplateId(subject, message)

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority,
      channel: 'invite',
      requester_name: coachProfile?.full_name || session.user.email || 'Coach',
      requester_email: coachProfile?.email || session.user.email || null,
      requester_role: role,
      assigned_to: null,
      last_message_preview: message.slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata: {
        suggested_template: suggestedTemplate,
        requester_id: session.user.id,
        coach_id: coachId,
        invite_type: 'athlete',
        invite_email: inviteEmail,
        invite_name: name || null,
        invite_sport: sport || null,
        invite_location: location || null,
        invite_status: status || null,
        invite_label: label || null,
        invite_notes: notes || null,
        invite_source: 'coach_athletes_add',
      },
    })
    .select('id')
    .single()

  if (ticketError || !ticket) {
    return jsonError(ticketError?.message || 'Unable to queue invite.', 500)
  }

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: role,
    sender_name: coachProfile?.full_name || session.user.email || 'Coach',
    sender_id: session.user.id,
    body: message,
    is_internal: false,
  })

  const inviteSignupUrl = `https://coacheshive.com/signup?role=athlete&email=${encodeURIComponent(inviteEmail)}`
  await sendTransactionalEmail({
    toEmail: inviteEmail,
    toName: name || null,
    subject: `${coachProfile?.full_name || 'A coach'} invited you to Coaches Hive`,
    templateAlias: 'user_invite',
    templateModel: {
      email_heading: 'You were invited to Coaches Hive',
      message_preview: `${coachProfile?.full_name || 'A coach'} invited you to connect on Coaches Hive as an athlete.`,
      cta_label: 'Create your account',
      action_url: inviteSignupUrl,
      invite_type: 'athlete',
      inviter_name: coachProfile?.full_name || 'A coach',
      inviter_role: 'Coach',
      athlete_name: name || '',
      invite_type_label: 'athlete',
      body_html: `<p><strong>${coachProfile?.full_name || 'A coach'}</strong> invited you to connect on Coaches Hive.</p><p>Create your free account to accept the invite and get started.</p>`,
    },
    tag: 'coach_invite_athlete',
    metadata: {
      coach_id: coachId,
      coach_name: coachProfile?.full_name || null,
      invite_type: 'athlete',
      ticket_id: ticket.id,
    },
  })

  return NextResponse.json({ status: 'queued', id: ticket.id })
}
