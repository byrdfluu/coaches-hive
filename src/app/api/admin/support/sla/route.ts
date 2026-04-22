import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { queueOperationTaskSafely } from '@/lib/operations'
import { logAdminAction } from '@/lib/auditLog'
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
  if (!session) return { error: jsonError('Unauthorized', 401), session: null as any }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (
    adminAccess.teamRole !== 'support'
    && adminAccess.teamRole !== 'ops'
    && adminAccess.teamRole !== 'finance'
    && adminAccess.teamRole !== 'superadmin'
  ) {
    return { error: jsonError('Forbidden', 403), session: null as any }
  }
  return { error: null, session }
}

export async function POST() {
  const { error, session } = await requireAdmin()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const nowIso = new Date().toISOString()
  const now = new Date(nowIso).toISOString()
  const { data: overdueTickets } = await supabaseAdmin
    .from('support_tickets')
    .select('id, subject, status, assigned_to, metadata')
    .in('status', ['open', 'pending'])
    .lt('sla_due_at', now)
    .order('sla_due_at', { ascending: true })
    .limit(200)

  let escalated = 0
  for (const ticket of overdueTickets || []) {
    const metadata = (ticket.metadata || {}) as Record<string, any>
    const escalationCount = Number(metadata.escalation_count || 0) + 1
    const nextMetadata = {
      ...metadata,
      sla_escalated: true,
      sla_escalated_at: nowIso,
      escalation_count: escalationCount,
    }

    await supabaseAdmin
      .from('support_tickets')
      .update({
        status: 'pending',
        assigned_to: ticket.assigned_to || session.user.id,
        metadata: nextMetadata,
        updated_at: nowIso,
      })
      .eq('id', ticket.id)

    await queueOperationTaskSafely({
      type: 'support_followup',
      title: `SLA escalation: ${ticket.subject || 'Support ticket'}`,
      priority: escalationCount >= 2 ? 'urgent' : 'high',
      owner: 'Support Ops',
      entity_type: 'support_ticket',
      entity_id: ticket.id,
      max_attempts: 5,
      idempotency_key: `sla_escalation:${ticket.id}:${String(new Date(nowIso).toISOString().slice(0, 13))}`,
      metadata: {
        escalation_count: escalationCount,
      },
    })
    escalated += 1
  }

  await logAdminAction({
    action: 'support.sla_sweep.run',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'support_ticket',
    targetId: null,
    metadata: {
      escalated,
    },
  })

  return NextResponse.json({ ok: true, escalated })
}
