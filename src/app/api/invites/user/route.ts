import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { sendUserInviteEmail } from '@/lib/inviteDelivery'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type InviteType = 'coach' | 'athlete'

const VALID_TYPES = new Set<InviteType>(['coach', 'athlete'])

const canInviteType = (role: string, inviteType: InviteType) => {
  if (role === 'athlete') return ['coach', 'athlete'].includes(inviteType)
  if (role === 'coach' || role === 'assistant_coach' || role === 'admin') return ['coach', 'athlete'].includes(inviteType)
  return false
}

const getInviteDeliveryFailureMessage = (delivery: { status?: string; error?: string; reason?: string }) => {
  const detail = String(delivery.error || delivery.reason || '').trim()
  if (!detail) {
    return 'Invite saved, but email delivery failed.'
  }
  if (/missing postmark configuration/i.test(detail)) {
    return 'Invite saved, but email sending is not configured on the server yet.'
  }
  return `Invite saved, but email delivery failed. ${detail}`
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const currentRole = getSessionRoleState(session.user.user_metadata).currentRole || 'member'
  const payload = await request.json().catch(() => ({}))
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const inviteType = typeof payload?.invite_type === 'string' ? payload.invite_type.trim().toLowerCase() as InviteType : null

  if (!email) {
    return jsonError('Email is required.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Please enter a valid email address.')
  }
  if (!inviteType || !VALID_TYPES.has(inviteType)) {
    return jsonError('invite_type must be coach or athlete.')
  }
  if (!canInviteType(currentRole, inviteType)) {
    return jsonError('Forbidden', 403)
  }
  if (email === String(session.user.email || '').trim().toLowerCase()) {
    return jsonError('You cannot invite your own email address.')
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', session.user.id)
    .maybeSingle()

  const inviterName = profile?.full_name || session.user.user_metadata?.full_name || session.user.email || 'A Coaches Hive member'
  const inviterEmail = profile?.email || session.user.email || null

  const cooldownCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentInvite } = await supabaseAdmin
    .from('support_tickets')
    .select('id')
    .eq('channel', 'invite')
    .gte('created_at', cooldownCutoff)
    .filter('metadata->>invite_email', 'eq', email)
    .filter('metadata->>invite_type', 'eq', inviteType)
    .filter('metadata->>requester_id', 'eq', session.user.id)
    .maybeSingle()

  if (recentInvite) {
    return jsonError('This email was already invited recently. You can send another invite in 7 days.')
  }

  const now = new Date().toISOString()
  const priority = 'medium'
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const subject = 'Invite user'
  const message = [
    'Invite user request',
    `Email: ${email}`,
    `Invite type: ${inviteType}`,
    `Inviter role: ${currentRole}`,
    'Source: Generic invite modal',
  ].join('\n')

  const metadata = {
    suggested_template: suggestTemplateId(subject, message),
    requester_id: session.user.id,
    invite_type: inviteType,
    invite_email: email,
    invite_source: 'generic_modal',
    invite_delivery: 'queued',
  }

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority,
      channel: 'invite',
      requester_name: inviterName,
      requester_email: inviterEmail,
      requester_role: currentRole,
      assigned_to: null,
      last_message_preview: message.slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata,
    })
    .select('id')
    .single()

  if (ticketError || !ticket) {
    return jsonError(ticketError?.message || 'Unable to create invite.', 500)
  }

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: currentRole,
    sender_name: inviterName,
    sender_id: session.user.id,
    body: message,
    is_internal: false,
  })

  const delivery = await sendUserInviteEmail({
    toEmail: email,
    inviteType,
    inviterName,
    inviterRole: currentRole,
    inviteSource: 'generic_modal',
  })

  await supabaseAdmin
    .from('support_tickets')
    .update({
      metadata: {
        ...metadata,
        invite_delivery: delivery.status || 'failed',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id)

  if (delivery.status !== 'sent') {
    return NextResponse.json({ error: getInviteDeliveryFailureMessage(delivery) }, { status: 503 })
  }

  return NextResponse.json({ status: 'queued', invite_type: inviteType, invite_delivery: delivery.status })
}
