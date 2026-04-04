import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { sendSupportTicketReplyEmail } from '@/lib/email'
import { queueOperationTaskSafely } from '@/lib/operations'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (
    adminAccess.teamRole !== 'support'
    && adminAccess.teamRole !== 'ops'
    && adminAccess.teamRole !== 'finance'
    && adminAccess.teamRole !== 'superadmin'
  ) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET(request: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const ticketId = searchParams.get('ticket_id')
  if (!ticketId) return jsonError('ticket_id is required')

  const { data, error: queryError } = await supabaseAdmin
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  if (queryError) return jsonError(queryError.message, 500)

  return NextResponse.json({ messages: data || [] })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const { ticket_id, body, is_internal = false, sender_role = 'admin' } = payload || {}

  if (!ticket_id) return jsonError('ticket_id is required')
  if (!body) return jsonError('body is required')

  const { data: message, error: insertError } = await supabaseAdmin
    .from('support_messages')
    .insert({
      ticket_id,
      sender_role,
      sender_name: sender_role === 'admin' ? session?.user.email : undefined,
      sender_id: session?.user.id,
      body,
      is_internal,
    })
    .select('*')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('id, subject, channel, requester_email, requester_name')
    .eq('id', ticket_id)
    .maybeSingle()

  await supabaseAdmin
    .from('support_tickets')
    .update({
      last_message_preview: String(body).slice(0, 140),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket_id)

  let warning: string | null = null
  let emailDeliveryStatus: string | null = null

  if (!is_internal && sender_role === 'admin' && ticket?.requester_email) {
    const delivery = await sendSupportTicketReplyEmail({
      toEmail: ticket.requester_email,
      toName: ticket.requester_name || null,
      subject: ticket.subject || null,
      replyBody: String(body),
      ticketId: ticket_id,
      messageId: message.id,
    })

    emailDeliveryStatus = String(delivery?.status || 'unknown')
    if (delivery?.status !== 'sent') {
      warning = 'Reply saved, but the email was not delivered. Check support email configuration.'
      await queueOperationTaskSafely({
        type: 'support_followup',
        title: `Support reply email failed for ticket ${ticket_id}`,
        priority: 'high',
        owner: 'Support Ops',
        entity_type: 'support_ticket',
        entity_id: ticket_id,
        max_attempts: 3,
        idempotency_key: `support_reply_email:${ticket_id}:${message.id}`,
        metadata: {
          delivery_status: delivery?.status || 'failed',
          delivery_error: (delivery as { error?: string; reason?: string } | null)?.error
            || (delivery as { error?: string; reason?: string } | null)?.reason
            || null,
          requester_email: ticket.requester_email,
        },
      })
    }
  }

  return NextResponse.json({
    message,
    warning,
    email_delivery_status: emailDeliveryStatus,
  })
}
