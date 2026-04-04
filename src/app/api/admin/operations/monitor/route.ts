import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  buildOperationsSummary,
  getOperationsConfig,
  queueOperationTaskSafely,
  saveOperationsConfig,
  type OperationsConfig,
} from '@/lib/operations'
import { getGuardianOpsSnapshot } from '@/lib/guardianAdminOps'
import { resolveAdminAccess } from '@/lib/adminRoles'

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
  if (!session) return { error: jsonError('Unauthorized', 401), session: null as any }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'ops' && adminAccess.teamRole !== 'superadmin') {
    return { error: jsonError('Forbidden', 403), session: null as any }
  }
  return { error: null, session }
}

const appendIncidentIfMissing = (
  config: OperationsConfig,
  incident: { title: string; detail: string; severity: 'low' | 'medium' | 'high' | 'critical' }
) => {
  const exists = config.incidentFeed.some(
    (item) =>
      item.title.toLowerCase() === incident.title.toLowerCase()
      && item.status !== 'resolved'
  )
  if (exists) return config
  return {
    ...config,
    incidentFeed: [
      {
        id: `ops-incident-${crypto.randomUUID()}`,
        title: incident.title,
        severity: incident.severity,
        status: 'open' as const,
        detail: incident.detail,
        created_at: new Date().toISOString(),
      },
      ...config.incidentFeed,
    ].slice(0, 100),
  }
}

export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  const nowIso = new Date().toISOString()
  const now = new Date(nowIso).toISOString()
  let config = await getOperationsConfig()
  const summary = buildOperationsSummary(config)

  if (summary.dead_letter_tasks > 0) {
    config = appendIncidentIfMissing(config, {
      title: 'Dead-letter queue has pending tasks',
      detail: `${summary.dead_letter_tasks} tasks are in dead-letter and need manual replay.`,
      severity: 'high',
    })
  }
  if (summary.queue_lag_minutes >= 15) {
    config = appendIncidentIfMissing(config, {
      title: 'Queue lag threshold exceeded',
      detail: `Oldest queued task is delayed by ${summary.queue_lag_minutes} minutes.`,
      severity: 'medium',
    })
  }

  const { count: overdueTickets } = await supabaseAdmin
    .from('support_tickets')
    .select('id', { head: true, count: 'exact' })
    .in('status', ['open', 'pending'])
    .lt('sla_due_at', now)

  if ((overdueTickets || 0) >= 3) {
    config = appendIncidentIfMissing(config, {
      title: 'Support SLA breach risk',
      detail: `${overdueTickets} support tickets are past SLA.`,
      severity: 'high',
    })
  }

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
  const users = usersData?.users || []
  const unverifiedUsers = users.filter((user) => !user.email_confirmed_at && !user.confirmed_at).length
  if (unverifiedUsers >= 10) {
    config = appendIncidentIfMissing(config, {
      title: 'Auth verification drop-off elevated',
      detail: `${unverifiedUsers} users in the current auth snapshot are still unverified.`,
      severity: 'medium',
    })
  }

  const guardianMonitor = await getGuardianOpsSnapshot()
  const dateKey = new Date().toISOString().slice(0, 10)

  if (guardianMonitor.pending_stale_24h >= 5) {
    config = appendIncidentIfMissing(config, {
      title: 'Guardian approvals are aging past SLA',
      detail: `${guardianMonitor.pending_stale_24h} guardian approvals are pending for more than 24 hours.`,
      severity: 'high',
    })
    await queueOperationTaskSafely({
      type: 'support_followup',
      title: 'Escalate stale guardian approvals',
      priority: 'high',
      owner: 'Support Ops',
      entity_type: 'guardian_approval',
      entity_id: null,
      idempotency_key: `guardian_stale_escalation:${dateKey}`,
      metadata: { pending_stale_24h: guardianMonitor.pending_stale_24h },
    })
  }

  if (guardianMonitor.failed_notifications > 0) {
    config = appendIncidentIfMissing(config, {
      title: 'Guardian approval notification failures detected',
      detail: `${guardianMonitor.failed_notifications} pending approvals have failed email or notification delivery.`,
      severity: 'medium',
    })
    await queueOperationTaskSafely({
      type: 'webhook_replay',
      title: 'Replay failed guardian approval notifications',
      priority: 'medium',
      owner: 'Platform Ops',
      entity_type: 'guardian_approval',
      entity_id: null,
      idempotency_key: `guardian_notification_failures:${dateKey}`,
      metadata: { failed_notifications: guardianMonitor.failed_notifications },
    })
  }

  if (guardianMonitor.approval_rate > 0 && guardianMonitor.approval_rate < 50) {
    config = appendIncidentIfMissing(config, {
      title: 'Guardian approval conversion dropped',
      detail: `Guardian approval rate is ${guardianMonitor.approval_rate}% over the last 30 days.`,
      severity: 'low',
    })
  }

  const saved = await saveOperationsConfig(config)
  const nextSummary = buildOperationsSummary(saved)

  return NextResponse.json({
    summary: nextSummary,
    monitor: {
      overdue_support_tickets: overdueTickets || 0,
      sampled_unverified_users: unverifiedUsers,
      guardian: guardianMonitor,
    },
  })
}
