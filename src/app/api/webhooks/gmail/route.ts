import { NextResponse } from 'next/server'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { getMessage, listHistory, listUnreadMessages, extractHeader, parseEmailAddress, extractMessageBody, modifyMessageLabels } from '@/lib/gmail'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireSecret = (request: Request) => {
  const expected = process.env.SUPPORT_WEBHOOK_SECRET
  if (!expected) return true
  const header = request.headers.get('x-support-secret')
  const url = new URL(request.url)
  const query = url.searchParams.get('secret')
  return expected === header || expected === query
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

export async function POST(request: Request) {
  if (!requireSecret(request)) {
    return jsonError('Forbidden', 403)
  }

  const body = await request.json().catch(() => null)
  if (!body?.message?.data) {
    return NextResponse.json({ ok: true })
  }

  const decoded = Buffer.from(body.message.data, 'base64').toString('utf8')
  const payload = JSON.parse(decoded)
  const emailAddress = payload.emailAddress || process.env.GMAIL_SUPPORT_EMAIL
  const historyId = payload.historyId as string | undefined

  if (!emailAddress) {
    return jsonError('Missing emailAddress', 400)
  }

  const config = await getAdminConfig('support')
  const lastHistoryId = config?.gmail_history_id

  try {
    if (historyId && lastHistoryId) {
      const history = await listHistory(emailAddress, lastHistoryId)
      const entries = history.history || []
      for (const entry of entries) {
        const messages = entry.messages || []
        for (const msg of messages) {
          const fullMessage = await getMessage(emailAddress, msg.id)
          await upsertTicketFromMessage(fullMessage, emailAddress)
        }
      }
    } else {
      const list = await listUnreadMessages(emailAddress)
      const messages = list.messages || []
      for (const msg of messages) {
        const fullMessage = await getMessage(emailAddress, msg.id)
        await upsertTicketFromMessage(fullMessage, emailAddress)
      }
    }
  } catch (error: any) {
    return jsonError(error?.message || 'Gmail ingestion failed', 500)
  }

  if (historyId) {
    await setAdminConfig('support', { ...config, gmail_history_id: historyId })
  }

  return NextResponse.json({ ok: true })
}
