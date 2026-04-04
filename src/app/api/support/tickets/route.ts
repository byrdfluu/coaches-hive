import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { sendSupportTicketReceivedEmail } from '@/lib/email'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const payload = await request.json().catch(() => ({}))
  const { subject, message, priority = 'medium' } = payload || {}

  if (!subject) return jsonError('subject is required')
  if (!message) return jsonError('message is required')

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', session.user.id)
    .maybeSingle()

  const requesterRole = getSessionRoleState(session.user.user_metadata).currentRole || 'member'
  const requesterName = profile?.full_name || session.user.user_metadata?.full_name || session.user.email
  const requesterEmail = session.user.email

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
      metadata: { suggested_template: suggestedTemplate, requester_id: session.user.id },
    })
    .select('*')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: requesterRole,
    sender_name: requesterName,
    sender_id: session.user.id,
    body: message,
    is_internal: false,
  })

  if (requesterEmail) {
    await sendSupportTicketReceivedEmail({
      toEmail: requesterEmail,
      toName: requesterName,
      subject,
      ticketId: ticket.id,
    }).catch(() => null)
  }

  return NextResponse.json({ ticket })
}
