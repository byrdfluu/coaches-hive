import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { listUnreadMessages, getMessage, extractHeader, parseEmailAddress, extractMessageBody, modifyMessageLabels } from '@/lib/gmail'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

const upsertTicketFromMessage = async (message: any, email: string) => {
  const headers = message.payload?.headers || []
  const subject = extractHeader(headers, 'Subject') || 'Support request'
  const fromHeader = extractHeader(headers, 'From')
  const requesterEmail = parseEmailAddress(fromHeader)
  const requesterName = fromHeader.replace(/<.*>/, '').trim() || requesterEmail
  const snippet = message.snippet || ''
  const body = extractMessageBody(message.payload) || snippet
  const messageId = message.id
  const threadId = message.threadId
  const suggestedTemplate = suggestTemplateId(subject, body)
  const receivedAt = new Date(Number(message.internalDate || Date.now())).toISOString()
  const slaMinutes = getSlaMinutes('medium')
  const slaDueAt = getSlaDueAt(receivedAt, 'medium')

  const { data: existing } = await supabaseAdmin
    .from('support_tickets')
    .select('id')
    .eq('external_message_id', messageId)
    .maybeSingle()

  if (existing?.id) return

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', requesterEmail)
    .maybeSingle()

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority: 'medium',
      channel: 'email',
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: 'unknown',
      org_name: null,
      team_name: null,
      assigned_to: null,
      last_message_preview: snippet.slice(0, 140),
      last_message_at: receivedAt,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      external_message_id: messageId,
      external_thread_id: threadId,
      metadata: {
        provider: 'gmail',
        mailbox: email,
        suggested_template: suggestedTemplate,
        requester_id: profile?.id || null,
      },
    })
    .select('*')
    .single()

  if (insertError) {
    throw new Error(insertError.message)
  }

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: 'user',
    sender_name: requesterName,
    body,
    is_internal: false,
    metadata: { provider: 'gmail', message_id: messageId, thread_id: threadId, subject },
  })

  const labelName = process.env.SUPPORT_GMAIL_LABEL
  if (labelName) {
    await modifyMessageLabels(email, messageId, labelName)
  }
}

export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  const emailAddress = process.env.GMAIL_SUPPORT_EMAIL
  if (!emailAddress) {
    return jsonError('Missing GMAIL_SUPPORT_EMAIL', 400)
  }

  const list = await listUnreadMessages(emailAddress)
  const messages = list.messages || []

  for (const msg of messages) {
    const fullMessage = await getMessage(emailAddress, msg.id)
    await upsertTicketFromMessage(fullMessage, emailAddress)
  }

  return NextResponse.json({ ok: true, count: messages.length })
}
