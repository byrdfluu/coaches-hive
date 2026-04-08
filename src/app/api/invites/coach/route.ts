import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { sendCoachDiscoveryInviteEmail } from '@/lib/inviteDelivery'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const role = getSessionRoleState(session.user.user_metadata).currentRole
  if (role !== 'athlete') {
    return jsonError('Forbidden', 403)
  }

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .select('id, status, created_at, updated_at, metadata')
    .eq('channel', 'invite')
    .filter('metadata->>invite_type', 'eq', 'coach')
    .filter('metadata->>requester_id', 'eq', session.user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    return jsonError('Unable to load coach invites.', 500)
  }

  const invites = ((data || []) as Array<{
    id: string
    status?: string | null
    created_at?: string | null
    updated_at?: string | null
    metadata?: {
      invite_email?: string | null
      invite_delivery?: string | null
      invite_source?: string | null
    } | null
  }>).map((row) => ({
    id: row.id,
    status: row.status || 'open',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    email: row.metadata?.invite_email || null,
    invite_delivery: row.metadata?.invite_delivery || 'queued',
    invite_source: row.metadata?.invite_source || 'athlete_discover',
  }))

  return NextResponse.json({ invites })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const payload = await request.json().catch(() => ({}))
  const emailRaw = typeof payload?.email === 'string' ? payload.email.trim() : ''
  const email = emailRaw.toLowerCase()

  if (!email) {
    return jsonError('Email is required.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Please enter a valid email address.')
  }

  // Duplicate guard — prevent the same email from being invited more than once per 7 days.
  const cooldownCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentInvite } = await supabaseAdmin
    .from('support_tickets')
    .select('id, created_at')
    .eq('channel', 'invite')
    .gte('created_at', cooldownCutoff)
    .filter('metadata->>invite_email', 'eq', email)
    .filter('metadata->>invite_type', 'eq', 'coach')
    .maybeSingle()

  if (recentInvite) {
    return jsonError('This email was already invited recently. You can send another invite in 7 days.')
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email')
    .eq('id', session.user.id)
    .maybeSingle()

  const requesterRole = getSessionRoleState(session.user.user_metadata).currentRole || 'member'
  const requesterName = profile?.full_name || session.user.user_metadata?.full_name || session.user.email
  const requesterEmail = profile?.email || session.user.email
  const subject = 'Invite coach'
  const message = [
    'Invite coach request',
    `Email: ${email}`,
    'Source: Athlete discover',
  ].join('\n')

  const now = new Date().toISOString()
  const priority = 'medium'
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const suggestedTemplate = suggestTemplateId(subject, message)
  const metadata = {
    suggested_template: suggestedTemplate,
    requester_id: session.user.id,
    invite_type: 'coach',
    invite_email: email,
    invite_source: 'athlete_discover',
    invite_delivery: 'queued',
  }

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority,
      channel: 'invite',
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: requesterRole,
      assigned_to: null,
      last_message_preview: message.slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata,
    })
    .select('id')
    .single()

  if (insertError || !ticket) {
    return jsonError(insertError?.message || 'Unable to create invite.', 500)
  }

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: requesterRole,
    sender_name: requesterName,
    sender_id: session.user.id,
    body: message,
    is_internal: false,
  })

  let warning: string | null = null
  let inviteDeliveryStatus = metadata.invite_delivery

  const delivery = await sendCoachDiscoveryInviteEmail({
    toEmail: email,
    inviterName: requesterName || null,
    inviterRole: requesterRole || null,
    inviteSource: 'athlete_discover',
  })
  inviteDeliveryStatus = delivery.status || 'failed'
  // 'skipped' means Postmark is not configured (e.g. dev/sandbox) — invite ticket is still
  // saved and will be followed up manually; do not surface a failure warning to the user.
  if (inviteDeliveryStatus === 'failed') {
    warning = 'Invite was saved but the email could not be delivered. We will follow up manually.'
  }

  await supabaseAdmin
    .from('support_tickets')
    .update({
      metadata: {
        ...metadata,
        invite_delivery: inviteDeliveryStatus,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id)

  return NextResponse.json({ status: 'queued', id: ticket.id, invite_delivery: inviteDeliveryStatus, warning })
}
