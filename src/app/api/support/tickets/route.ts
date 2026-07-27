import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { sendSupportTicketReceivedEmail } from '@/lib/email'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { resolveSupportDashboardPath } from '@/lib/supportPaths'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: tickets, error } = await supabaseAdmin
    .from('support_tickets')
    .select('id, subject, status, priority, channel, last_message_preview, last_message_at, requester_unread_count, created_at')
    .eq('requester_email', user.email!)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ tickets: tickets || [] })
}


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const payload = await request.json().catch(() => ({}))
  const { subject, message, priority = 'medium' } = payload || {}

  if (!subject) return jsonError('subject is required')
  if (!message) return jsonError('message is required')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const requesterRole = getSessionRoleState(user.user_metadata).currentRole || 'member'
  const requesterName = profile?.full_name || user.user_metadata?.full_name || user.email
  const requesterEmail = user.email

  const now = new Date().toISOString()
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const suggestedTemplate = suggestTemplateId(subject, message)
  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority,
      channel: 'in_app',
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: requesterRole,
      assigned_to: null,
      last_message_preview: String(message).slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata: { suggested_template: suggestedTemplate, requester_id: user.id },
      staff_unread_count: 1,
    })
    .select('*')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: requesterRole,
    sender_name: requesterName,
    sender_id: user.id,
    body: message,
    is_internal: false,
  })

  if (requesterEmail) {
    await sendSupportTicketReceivedEmail({
      toEmail: requesterEmail,
      toName: requesterName,
      subject,
      ticketId: ticket.id,
      dashboardUrl: resolveSupportDashboardPath(requesterRole),
    }).catch(() => null)
  }

  return NextResponse.json({ ticket })
}
