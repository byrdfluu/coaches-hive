import { getAdminConfig, getDefaultAdminConfig, setAdminConfig } from '@/lib/adminConfig'

export type OperationControlStatus = 'active' | 'needs_attention' | 'planned'
export type OperationLifecycleStatus = 'active' | 'needs_attention' | 'paused' | 'planned'
export type OperationTaskStatus = 'queued' | 'processing' | 'failed' | 'dead_letter' | 'completed'
export type OperationTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type OperationTaskType =
  | 'auth_recovery'
  | 'billing_recovery'
  | 'support_followup'
  | 'release_validation'
  | 'webhook_replay'
  | 'lifecycle_repair'

export type OperationLifecycleStage = {
  id: string
  name: string
  owner: string
  status: OperationLifecycleStatus
  sla_minutes: number
  description: string
}

export type OperationControl = {
  id: string
  title: string
  status: OperationControlStatus
  owner: string
  description: string
  last_reviewed: string
}

export type OperationTask = {
  id: string
  type: string
  title: string
  status: OperationTaskStatus
  priority: OperationTaskPriority
  attempts: number
  max_attempts: number
  owner: string
  entity_type: string | null
  entity_id: string | null
  last_error: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
  idempotency_key: string | null
  metadata?: Record<string, any> | null
}

export type OperationIncident = {
  id: string
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'monitoring' | 'resolved'
  detail: string
  created_at: string
}

export type OperationsConfig = {
  lifecycleStages: OperationLifecycleStage[]
  controls: OperationControl[]
  taskQueue: OperationTask[]
  incidentFeed: OperationIncident[]
}

export type OperationSummary = {
  total_tasks: number
  queued_tasks: number
  failed_tasks: number
  dead_letter_tasks: number
  overdue_tasks: number
  queue_lag_minutes: number
  controls_needing_attention: number
  open_incidents: number
  lifecycle_needing_attention: number
}

export type EnqueueOperationInput = {
  type: OperationTaskType | string
  title: string
  priority?: OperationTaskPriority
  owner?: string | null
  entity_type?: string | null
  entity_id?: string | null
  max_attempts?: number
  next_run_at?: string | null
  last_error?: string | null
  idempotency_key?: string | null
  metadata?: Record<string, any> | null
}

const CONTROL_STATUSES: OperationControlStatus[] = ['active', 'needs_attention', 'planned']
const LIFECYCLE_STATUSES: OperationLifecycleStatus[] = ['active', 'needs_attention', 'paused', 'planned']
const TASK_STATUSES: OperationTaskStatus[] = ['queued', 'processing', 'failed', 'dead_letter', 'completed']
const TASK_PRIORITIES: OperationTaskPriority[] = ['low', 'medium', 'high', 'urgent']
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
const INCIDENT_STATUSES = ['open', 'monitoring', 'resolved'] as const

const PRIORITY_RANK: Record<OperationTaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const asString = (value: unknown, fallback = '') => {
  if (typeof value !== 'string') return fallback
  return value.trim() || fallback
}

const asNumber = (value: unknown, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const asIsoDate = (value: unknown, fallback: string) => {
  if (!value || typeof value !== 'string') return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString()
}

const ensureControlStatus = (value: unknown): OperationControlStatus => {
  const normalized = asString(value) as OperationControlStatus
  return CONTROL_STATUSES.includes(normalized) ? normalized : 'planned'
}

const ensureLifecycleStatus = (value: unknown): OperationLifecycleStatus => {
  const normalized = asString(value) as OperationLifecycleStatus
  return LIFECYCLE_STATUSES.includes(normalized) ? normalized : 'planned'
}

const ensureTaskStatus = (value: unknown): OperationTaskStatus => {
  const normalized = asString(value) as OperationTaskStatus
  return TASK_STATUSES.includes(normalized) ? normalized : 'queued'
}

const ensureTaskPriority = (value: unknown): OperationTaskPriority => {
  const normalized = asString(value) as OperationTaskPriority
  return TASK_PRIORITIES.includes(normalized) ? normalized : 'medium'
}

const sortTasks = (tasks: OperationTask[]) =>
  tasks
    .slice()
    .sort((a, b) => {
      const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

const normalizeTask = (task: unknown, index: number): OperationTask => {
  const source = (task && typeof task === 'object' ? task : {}) as Record<string, any>
  const nowIso = new Date().toISOString()
  const createdAt = asIsoDate(source.created_at, nowIso)
  const updatedAt = asIsoDate(source.updated_at, createdAt)
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : null
  return {
    id: asString(source.id, `ops-task-default-${index + 1}`),
    type: asString(source.type, 'support_followup'),
    title: asString(source.title, 'Untitled task'),
    status: ensureTaskStatus(source.status),
    priority: ensureTaskPriority(source.priority),
    attempts: Math.max(0, asNumber(source.attempts, 0)),
    max_attempts: Math.max(1, asNumber(source.max_attempts, 3)),
    owner: asString(source.owner, 'Platform Ops'),
    entity_type: asString(source.entity_type, '') || null,
    entity_id: asString(source.entity_id, '') || null,
    last_error: asString(source.last_error, '') || null,
    next_run_at: asString(source.next_run_at, '') || null,
    created_at: createdAt,
    updated_at: updatedAt,
    idempotency_key: asString(source.idempotency_key, '') || null,
    metadata,
  }
}

const normalizeControl = (control: unknown, index: number): OperationControl => {
  const source = (control && typeof control === 'object' ? control : {}) as Record<string, any>
  const nowIso = new Date().toISOString()
  return {
    id: asString(source.id, `ops-control-${index + 1}`),
    title: asString(source.title, 'Untitled control'),
    status: ensureControlStatus(source.status),
    owner: asString(source.owner, 'Platform Ops'),
    description: asString(source.description, ''),
    last_reviewed: asIsoDate(source.last_reviewed, nowIso),
  }
}

const normalizeLifecycle = (stage: unknown, index: number): OperationLifecycleStage => {
  const source = (stage && typeof stage === 'object' ? stage : {}) as Record<string, any>
  return {
    id: asString(source.id, `ops-stage-${index + 1}`),
    name: asString(source.name, 'Untitled stage'),
    owner: asString(source.owner, 'Platform Ops'),
    status: ensureLifecycleStatus(source.status),
    sla_minutes: Math.max(5, asNumber(source.sla_minutes, 60)),
    description: asString(source.description, ''),
  }
}

const normalizeIncident = (incident: unknown, index: number): OperationIncident => {
  const source = (incident && typeof incident === 'object' ? incident : {}) as Record<string, any>
  const nowIso = new Date().toISOString()
  const severity = asString(source.severity, 'medium') as OperationIncident['severity']
  const status = asString(source.status, 'open') as OperationIncident['status']
  return {
    id: asString(source.id, `ops-incident-${index + 1}`),
    title: asString(source.title, 'Untitled incident'),
    severity: INCIDENT_SEVERITIES.includes(severity) ? severity : 'medium',
    status: INCIDENT_STATUSES.includes(status) ? status : 'open',
    detail: asString(source.detail, ''),
    created_at: asIsoDate(source.created_at, nowIso),
  }
}

export const normalizeOperationsConfig = (input: unknown): OperationsConfig => {
  const defaults = getDefaultAdminConfig<OperationsConfig>('operations')
  const source = (input && typeof input === 'object' ? input : {}) as Partial<OperationsConfig>

  const lifecycle = Array.isArray(source.lifecycleStages)
    ? source.lifecycleStages
    : defaults.lifecycleStages
  const controls = Array.isArray(source.controls)
    ? source.controls
    : defaults.controls
  const queue = Array.isArray(source.taskQueue)
    ? source.taskQueue
    : defaults.taskQueue
  const incidents = Array.isArray(source.incidentFeed)
    ? source.incidentFeed
    : defaults.incidentFeed

  return {
    lifecycleStages: lifecycle.map(normalizeLifecycle),
    controls: controls.map(normalizeControl),
    taskQueue: sortTasks(queue.map(normalizeTask)).slice(0, 200),
    incidentFeed: incidents.map(normalizeIncident),
  }
}

export const buildOperationsSummary = (config: OperationsConfig): OperationSummary => {
  const now = Date.now()
  const overdueTasks = config.taskQueue.filter((task) => {
    if (task.status === 'completed' || task.status === 'dead_letter') return false
    if (!task.next_run_at) return false
    return new Date(task.next_run_at).getTime() < now
  }).length

  const queueLagCandidates = config.taskQueue
    .filter((task) => task.status === 'queued' && task.next_run_at)
    .map((task) => now - new Date(task.next_run_at as string).getTime())
    .filter((diff) => diff > 0)
  const maxQueueLagMs = queueLagCandidates.length ? Math.max(...queueLagCandidates) : 0

  return {
    total_tasks: config.taskQueue.length,
    queued_tasks: config.taskQueue.filter((task) => task.status === 'queued' || task.status === 'processing').length,
    failed_tasks: config.taskQueue.filter((task) => task.status === 'failed').length,
    dead_letter_tasks: config.taskQueue.filter((task) => task.status === 'dead_letter').length,
    overdue_tasks: overdueTasks,
    queue_lag_minutes: Math.round(maxQueueLagMs / 60000),
    controls_needing_attention: config.controls.filter((control) => control.status === 'needs_attention').length,
    open_incidents: config.incidentFeed.filter((incident) => incident.status !== 'resolved').length,
    lifecycle_needing_attention: config.lifecycleStages.filter((stage) => stage.status === 'needs_attention').length,
  }
}

export const getOperationsConfig = async () => {
  const rawConfig = await getAdminConfig<OperationsConfig>('operations')
  return normalizeOperationsConfig(rawConfig)
}

export const saveOperationsConfig = async (config: OperationsConfig) => {
  const normalized = normalizeOperationsConfig(config)
  await setAdminConfig('operations', normalized as unknown as Record<string, any>)
  return normalized
}

export const enqueueOperationTask = (config: OperationsConfig, input: EnqueueOperationInput) => {
  const nowIso = new Date().toISOString()
  const idempotencyKey = asString(input.idempotency_key, '') || null
  if (idempotencyKey) {
    const existing = config.taskQueue.find(
      (task) =>
        task.idempotency_key === idempotencyKey
        && task.status !== 'completed'
        && task.status !== 'dead_letter'
    )
    if (existing) {
      return {
        ...config,
        taskQueue: sortTasks(config.taskQueue.map((task) =>
          task.id === existing.id
            ? { ...task, updated_at: nowIso }
            : task
        )),
      }
    }
  }
  const task: OperationTask = {
    id: `ops-${crypto.randomUUID()}`,
    type: asString(input.type, 'support_followup'),
    title: asString(input.title, 'Untitled task'),
    status: 'queued',
    priority: ensureTaskPriority(input.priority),
    attempts: 0,
    max_attempts: Math.max(1, asNumber(input.max_attempts, 3)),
    owner: asString(input.owner, 'Platform Ops'),
    entity_type: asString(input.entity_type, '') || null,
    entity_id: asString(input.entity_id, '') || null,
    last_error: asString(input.last_error, '') || null,
    next_run_at: asString(input.next_run_at, '') || nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    idempotency_key: idempotencyKey,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : null,
  }
  return {
    ...config,
    taskQueue: sortTasks([task, ...config.taskQueue]).slice(0, 200),
  }
}

export const retryOperationTask = (
  config: OperationsConfig,
  taskId: string
): { config: OperationsConfig; updatedTask: OperationTask | null } => {
  const nowIso = new Date().toISOString()
  const scheduled = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  let updatedTask: OperationTask | null = null

  const queue = config.taskQueue.map((task) => {
    if (task.id !== taskId) return task
    const nextAttempts = task.attempts + 1
    if (nextAttempts >= task.max_attempts) {
      updatedTask = {
        ...task,
        attempts: nextAttempts,
        status: 'dead_letter',
        last_error: `max attempts reached (${task.max_attempts})`,
        next_run_at: null,
        updated_at: nowIso,
      }
      return updatedTask
    }
    updatedTask = {
      ...task,
      attempts: nextAttempts,
      status: 'queued',
      last_error: null,
      next_run_at: scheduled,
      updated_at: nowIso,
    }
    return updatedTask
  })

  return { config: { ...config, taskQueue: sortTasks(queue) }, updatedTask }
}

export const resolveOperationTask = (
  config: OperationsConfig,
  taskId: string
): { config: OperationsConfig; updatedTask: OperationTask | null } => {
  const nowIso = new Date().toISOString()
  let updatedTask: OperationTask | null = null
  const queue = config.taskQueue.map((task) => {
    if (task.id !== taskId) return task
    updatedTask = {
      ...task,
      status: 'completed',
      next_run_at: null,
      updated_at: nowIso,
    }
    return updatedTask
  })
  return { config: { ...config, taskQueue: sortTasks(queue) }, updatedTask }
}

export const setControlStatus = (config: OperationsConfig, controlId: string, status: OperationControlStatus) => {
  const nowIso = new Date().toISOString()
  return {
    ...config,
    controls: config.controls.map((control) =>
      control.id === controlId
        ? { ...control, status: ensureControlStatus(status), last_reviewed: nowIso }
        : control
    ),
  }
}

export const setLifecycleStageStatus = (config: OperationsConfig, stageId: string, status: OperationLifecycleStatus) => {
  return {
    ...config,
    lifecycleStages: config.lifecycleStages.map((stage) =>
      stage.id === stageId
        ? { ...stage, status: ensureLifecycleStatus(status) }
        : stage
    ),
  }
}

export const queueOperationTask = async (input: EnqueueOperationInput) => {
  const current = await getOperationsConfig()
  const next = enqueueOperationTask(current, input)
  const saved = await saveOperationsConfig(next)
  return saved.taskQueue[0] || null
}

export const processDueOperationTasks = (
  config: OperationsConfig,
  limit = 10
): { config: OperationsConfig; processed: OperationTask[] } => {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const dueIds = config.taskQueue
    .filter((task) => {
      if (task.status !== 'queued') return false
      if (!task.next_run_at) return true
      return new Date(task.next_run_at).getTime() <= now
    })
    .slice(0, Math.max(1, limit))
    .map((task) => task.id)
  const processed: OperationTask[] = []
  const queue = config.taskQueue.map((task) => {
    if (!dueIds.includes(task.id)) return task
    const next = {
      ...task,
      status: 'processing' as OperationTaskStatus,
      updated_at: nowIso,
    }
    processed.push(next)
    return next
  })
  return { config: { ...config, taskQueue: sortTasks(queue) }, processed }
}

export const queueOperationTaskSafely = async (input: EnqueueOperationInput) => {
  try {
    return await queueOperationTask(input)
  } catch (error) {
    console.error('Unable to queue operation task', error)
    return null
  }
}
