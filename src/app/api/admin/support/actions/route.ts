import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { queueOperationTaskSafely } from '@/lib/operations'
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
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.teamRole) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session, teamRole: adminAccess.teamRole }
}

const stringifyCsvValue = (value: unknown) => {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const buildCsv = (rows: Record<string, unknown>[], headers: string[]) => {
  const headerRow = headers.map(stringifyCsvValue).join(',')
  const bodyRows = rows.map((row) => headers.map((key) => stringifyCsvValue(row[key])).join(','))
  return [headerRow, ...bodyRows].join('\n')
}

const findRequesterId = async (ticketId: string, requestedUserId?: string | null, requestedEmail?: string | null) => {
  if (requestedUserId) return requestedUserId

  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('metadata, requester_email')
    .eq('id', ticketId)
    .maybeSingle()

  const metadata = (ticket?.metadata || {}) as Record<string, any>
  if (metadata.requester_id) return String(metadata.requester_id)

  const email = requestedEmail || ticket?.requester_email
  if (!email) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  return profile?.id ?? null
}

const upsertTicketMetadata = async (ticketId: string, updates: Record<string, any>) => {
  if (!Object.keys(updates).length) return
  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('metadata')
    .eq('id', ticketId)
    .maybeSingle()
  const metadata = { ...(ticket?.metadata as Record<string, any> || {}), ...updates }
  await supabaseAdmin
    .from('support_tickets')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
}

const logSupportMessage = async (ticketId: string, body: string, actorId?: string | null) => {
  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticketId,
    sender_role: 'system',
    sender_name: 'Support system',
    sender_id: actorId || null,
    body,
    is_internal: true,
  })
  await supabaseAdmin
    .from('support_tickets')
    .update({
      last_message_preview: String(body).slice(0, 140),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
}

export async function POST(request: Request) {
  const { error, session, teamRole } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const { action, ticket_id, order_id, payment_intent_id, reason, user_id, requester_email, follow_up_at } = payload || {}

  if (!action) return jsonError('action is required')
  if (!ticket_id) return jsonError('ticket_id is required')

  if (action === 'refund') {
    if (teamRole !== 'finance' && teamRole !== 'superadmin') {
      return jsonError('Forbidden', 403)
    }
  } else if (teamRole !== 'support' && teamRole !== 'ops' && teamRole !== 'finance' && teamRole !== 'superadmin') {
    return jsonError('Forbidden', 403)
  }

  if (action === 'refund') {
    let paymentIntent = payment_intent_id as string | undefined
    let orderId = order_id as string | undefined

    if (!paymentIntent && orderId) {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, payment_intent_id')
        .eq('id', orderId)
        .maybeSingle()
      paymentIntent = order?.payment_intent_id || undefined
    }

    if (!paymentIntent) {
      return jsonError('payment_intent_id or order_id with payment_intent_id is required')
    }

    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
        reason: reason || 'requested_by_customer',
      })

      if (orderId) {
        const refundAmount = refund.amount ? refund.amount / 100 : null
        const nowIso = new Date().toISOString()
        await supabaseAdmin
          .from('orders')
          .update({
            status: 'Refunded',
            refund_status: 'refunded',
            refund_amount: refundAmount,
            refunded_at: nowIso,
          })
          .eq('id', orderId)

        await supabaseAdmin
          .from('payment_receipts')
          .update({
            status: 'refunded',
            refund_amount: refundAmount,
            refunded_at: nowIso,
          })
          .eq('order_id', orderId)
      }

      await upsertTicketMetadata(ticket_id, {
        order_id: orderId || null,
        payment_intent_id: paymentIntent,
        last_refund_at: new Date().toISOString(),
      })

      await logSupportMessage(ticket_id, `Refund issued for payment intent ${paymentIntent}.`, session?.user.id)
      await logAdminAction({
        action: 'support.refund',
        actorId: session?.user.id,
        actorEmail: session?.user.email || null,
        targetType: 'support_ticket',
        targetId: ticket_id,
        metadata: { order_id: orderId || null, payment_intent_id: paymentIntent },
      })

      return NextResponse.json({ ok: true, refund })
    } catch (err: any) {
      await queueOperationTaskSafely({
        type: 'billing_recovery',
        title: 'Refund attempt failed and needs manual retry',
        priority: 'urgent',
        owner: 'Finance Ops',
        entity_type: 'support_ticket',
        entity_id: ticket_id,
        max_attempts: 3,
        idempotency_key: `refund_failure:${ticket_id}:${paymentIntent || 'na'}`,
        last_error: err?.message || 'Refund failed',
        metadata: {
          order_id: orderId || null,
          payment_intent_id: paymentIntent || null,
          action: 'refund',
        },
      })
      await logAdminAction({
        action: 'support.refund_failed',
        actorId: session?.user.id,
        actorEmail: session?.user.email || null,
        targetType: 'support_ticket',
        targetId: ticket_id,
        metadata: { order_id: orderId || null, payment_intent_id: paymentIntent, error: err?.message || 'Refund failed' },
      })
      return jsonError(err?.message || 'Unable to create refund', 500)
    }
  }

  if (action === 'lock_account') {
    const requesterId = await findRequesterId(ticket_id, user_id, requester_email)
    if (!requesterId) {
      return jsonError('user_id or requester_email is required to lock account')
    }

    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(requesterId)
    const userMetadata = existingUser?.user?.user_metadata || {}

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(requesterId, {
      user_metadata: { ...userMetadata, suspended: true },
    })
    if (updateError) {
      await queueOperationTaskSafely({
        type: 'support_followup',
        title: 'Account lock failed and requires manual intervention',
        priority: 'high',
        owner: 'Support Ops',
        entity_type: 'support_ticket',
        entity_id: ticket_id,
        max_attempts: 3,
        idempotency_key: `lock_failure:${ticket_id}:${requesterId}`,
        last_error: updateError.message,
        metadata: {
          requester_id: requesterId,
          action: 'lock_account',
        },
      })
      return jsonError(updateError.message, 500)
    }

    await upsertTicketMetadata(ticket_id, { requester_id: requesterId, last_lockout_at: new Date().toISOString() })
    await logSupportMessage(ticket_id, `Account locked for user ${requesterId}.`, session?.user.id)
    await logAdminAction({
      action: 'support.lock_account',
      actorId: session?.user.id,
      actorEmail: session?.user.email || null,
      targetType: 'user',
      targetId: requesterId,
      metadata: { ticket_id },
    })

    return NextResponse.json({ ok: true })
  }

  if (action === 'schedule_followup') {
    const { data: ticket } = await supabaseAdmin
      .from('support_tickets')
      .select('id, subject, status, metadata')
      .eq('id', ticket_id)
      .maybeSingle()

    if (!ticket) return jsonError('Ticket not found', 404)

    const parsedFollowUpAt = typeof follow_up_at === 'string' && follow_up_at.trim()
      ? new Date(follow_up_at)
      : new Date(Date.now() + 24 * 60 * 60 * 1000)
    const followUpAtIso = Number.isNaN(parsedFollowUpAt.getTime())
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : parsedFollowUpAt.toISOString()

    await queueOperationTaskSafely({
      type: 'support_followup',
      title: `Follow-up for support ticket ${ticket.subject || ticket_id}`,
      priority: 'high',
      owner: 'Support Ops',
      entity_type: 'support_ticket',
      entity_id: ticket_id,
      max_attempts: 3,
      idempotency_key: `support_followup:${ticket_id}:${followUpAtIso.slice(0, 16)}`,
      metadata: {
        scheduled_at: followUpAtIso,
        reason: reason || null,
      },
    })

    await upsertTicketMetadata(ticket_id, {
      follow_up_scheduled_at: followUpAtIso,
      follow_up_scheduled_by: session?.user.id || null,
      follow_up_reason: reason || null,
    })

    if (ticket.status === 'open') {
      await supabaseAdmin
        .from('support_tickets')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', ticket_id)
    }

    await logSupportMessage(
      ticket_id,
      `Follow-up scheduled for ${followUpAtIso}${reason ? ` (${reason})` : ''}.`,
      session?.user.id,
    )
    await logAdminAction({
      action: 'support.schedule_followup',
      actorId: session?.user.id,
      actorEmail: session?.user.email || null,
      targetType: 'support_ticket',
      targetId: ticket_id,
      metadata: {
        follow_up_at: followUpAtIso,
        reason: reason || null,
      },
    })

    return NextResponse.json({
      ok: true,
      follow_up_at: followUpAtIso,
    })
  }

  if (action === 'export_logs') {
    const { data: ticket } = await supabaseAdmin
      .from('support_tickets')
      .select('id, subject, status, priority, channel, requester_name, requester_email, created_at')
      .eq('id', ticket_id)
      .maybeSingle()

    if (!ticket) return jsonError('Ticket not found', 404)

    const { data: messages } = await supabaseAdmin
      .from('support_messages')
      .select('id, created_at, sender_role, sender_name, is_internal, body')
      .eq('ticket_id', ticket_id)
      .order('created_at', { ascending: true })

    const rows = (messages || []).map((msg) => ({
      ticket_id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      channel: ticket.channel,
      requester: ticket.requester_name || ticket.requester_email || '',
      ticket_created_at: ticket.created_at,
      message_id: msg.id,
      message_at: msg.created_at,
      sender_role: msg.sender_role,
      sender_name: msg.sender_name,
      internal: msg.is_internal ? 'yes' : 'no',
      body: msg.body,
    }))

    const csv = buildCsv(rows, [
      'ticket_id',
      'subject',
      'status',
      'priority',
      'channel',
      'requester',
      'ticket_created_at',
      'message_id',
      'message_at',
      'sender_role',
      'sender_name',
      'internal',
      'body',
    ])

    await logSupportMessage(ticket_id, 'Exported support ticket logs.', session?.user.id)
    await logAdminAction({
      action: 'support.export_logs',
      actorId: session?.user.id,
      actorEmail: session?.user.email || null,
      targetType: 'support_ticket',
      targetId: ticket_id,
      metadata: { rows: rows.length },
    })

    return NextResponse.json({
      ok: true,
      filename: `support-logs-${ticket_id}.csv`,
      content: csv,
    })
  }

  return jsonError('Unsupported action', 400)
}
