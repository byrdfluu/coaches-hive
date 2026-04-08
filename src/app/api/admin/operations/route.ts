import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { logAdminAction } from '@/lib/auditLog'
import {
  buildOperationsSummary,
  enqueueOperationTask,
  getOperationsConfig,
  processDueOperationTasks,
  resolveOperationTask,
  retryOperationTask,
  saveOperationsConfig,
  setControlStatus,
  setLifecycleStageStatus,
  type OperationControlStatus,
  type OperationLifecycleStatus,
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
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401), session: null }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'ops' && adminAccess.teamRole !== 'superadmin') {
    return { error: jsonError('Forbidden', 403), session: null }
  }
  return { error: null, session }
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const config = await getOperationsConfig()
  const summary = buildOperationsSummary(config)
  const guardianMonitor = await getGuardianOpsSnapshot()

  return NextResponse.json({ config, summary, guardian_monitor: guardianMonitor })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error
  if (!session) return jsonError('Unauthorized', 401)

  const payload = await request.json().catch(() => ({}))
  const action = String(payload?.action || '').trim()
  if (!action) return jsonError('action is required')

  const current = await getOperationsConfig()
  let nextConfig = current
  let targetId: string | null = null

  if (action === 'enqueue_task') {
    const title = String(payload?.title || '').trim()
    if (!title) return jsonError('title is required')
    nextConfig = enqueueOperationTask(current, {
      title,
      type: String(payload?.type || 'support_followup'),
      priority: payload?.priority,
      owner: payload?.owner,
      entity_type: payload?.entity_type,
      entity_id: payload?.entity_id,
      max_attempts: payload?.max_attempts,
      next_run_at: payload?.next_run_at,
      last_error: payload?.last_error,
      idempotency_key: payload?.idempotency_key,
      metadata: payload?.metadata,
    })
    targetId = nextConfig.taskQueue[0]?.id || null
  } else if (action === 'process_due_tasks') {
    const limit = Number(payload?.limit || 10)
    const result = processDueOperationTasks(current, Number.isFinite(limit) ? limit : 10)
    nextConfig = result.config
    targetId = `processed:${result.processed.length}`
  } else if (action === 'retry_task') {
    const taskId = String(payload?.task_id || '').trim()
    if (!taskId) return jsonError('task_id is required')
    const result = retryOperationTask(current, taskId)
    if (!result.updatedTask) return jsonError('Task not found', 404)
    nextConfig = result.config
    targetId = result.updatedTask.id
  } else if (action === 'resolve_task') {
    const taskId = String(payload?.task_id || '').trim()
    if (!taskId) return jsonError('task_id is required')
    const result = resolveOperationTask(current, taskId)
    if (!result.updatedTask) return jsonError('Task not found', 404)
    nextConfig = result.config
    targetId = result.updatedTask.id
  } else if (action === 'set_control_status') {
    const controlId = String(payload?.control_id || '').trim()
    const status = String(payload?.status || '').trim() as OperationControlStatus
    if (!controlId) return jsonError('control_id is required')
    nextConfig = setControlStatus(current, controlId, status)
    targetId = controlId
  } else if (action === 'set_lifecycle_status') {
    const stageId = String(payload?.stage_id || '').trim()
    const status = String(payload?.status || '').trim() as OperationLifecycleStatus
    if (!stageId) return jsonError('stage_id is required')
    nextConfig = setLifecycleStageStatus(current, stageId, status)
    targetId = stageId
  } else {
    return jsonError('Unsupported action')
  }

  const saved = await saveOperationsConfig(nextConfig)
  const summary = buildOperationsSummary(saved)

  await logAdminAction({
    action: `admin.operations.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'operations',
    targetId,
    metadata: {
      action,
      target_id: targetId,
    },
  })

  const guardianMonitor = await getGuardianOpsSnapshot()
  return NextResponse.json({ config: saved, summary, guardian_monitor: guardianMonitor })
}
