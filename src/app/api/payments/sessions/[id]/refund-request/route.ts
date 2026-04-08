import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaMinutes, getSlaDueAt } from '@/lib/supportSla'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete', 'coach', 'admin'])
  if (error || !session) return error
  const adminAccess = resolveAdminAccess(session.user.user_metadata)

  const { id: sessionPaymentId } = await params
  if (!sessionPaymentId) {
    return jsonError('Missing payment ID.', 400)
  }

  const { data: payment } = await supabaseAdmin
    .from('session_payments')
    .select('id, athlete_id, coach_id, amount, status')
    .eq('id', sessionPaymentId)
    .maybeSingle()

  if (!payment) {
    return jsonError('Payment not found.', 404)
  }

  const userId = session.user.id
  const userRole = adminAccess.role || getSessionRoleState(session.user.user_metadata).currentRole || 'athlete'

  const isAthlete = payment.athlete_id === userId
  const isAdmin = adminAccess.isAdmin

  if (!isAthlete && !isAdmin) {
    return jsonError('Only the athlete on the payment or an admin can request a refund.', 403)
  }

  const body = await request.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : 'other'
  const note = typeof body?.note === 'string' ? body.note.trim() : ''

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle()

  const requesterName = profile?.full_name || session.user.email || 'User'
  const requesterEmail = profile?.email || session.user.email || ''

  const messageLines = [`Refund request for session payment ${sessionPaymentId}`, `Reason: ${reason}`]
  if (note) messageLines.push(`Details: ${note}`)
  const messageBody = messageLines.join('\n')

  const now = new Date().toISOString()
  const priority = 'high'
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject: 'Refund request',
      status: 'open',
      priority,
      channel: 'refund',
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: userRole,
      assigned_to: null,
      last_message_preview: messageBody.slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata: {
        session_payment_id: sessionPaymentId,
        amount: payment.amount,
        reason,
        note: note || null,
        requester_id: userId,
      },
    })
    .select('id')
    .single()

  if (insertError || !ticket) {
    return jsonError(insertError?.message || 'Unable to submit refund request.', 500)
  }

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: userRole,
    sender_name: requesterName,
    sender_id: userId,
    body: messageBody,
    is_internal: false,
  })

  return NextResponse.json({ ticket_id: ticket.id })
}
