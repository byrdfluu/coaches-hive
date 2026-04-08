'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

type ControlStatus = 'active' | 'needs_attention' | 'planned'
type LifecycleStatus = 'active' | 'needs_attention' | 'paused' | 'planned'
type TaskStatus = 'queued' | 'processing' | 'failed' | 'dead_letter' | 'completed'
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

type OperationLifecycleStage = {
  id: string
  name: string
  owner: string
  status: LifecycleStatus
  sla_minutes: number
  description: string
}

type OperationControl = {
  id: string
  title: string
  status: ControlStatus
  owner: string
  description: string
  last_reviewed: string
}

type OperationTask = {
  id: string
  type: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  attempts: number
  max_attempts: number
  owner: string
  entity_type: string | null
  entity_id: string | null
  last_error: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

type OperationIncident = {
  id: string
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'monitoring' | 'resolved'
  detail: string
  created_at: string
}

type OperationsConfig = {
  lifecycleStages: OperationLifecycleStage[]
  controls: OperationControl[]
  taskQueue: OperationTask[]
  incidentFeed: OperationIncident[]
}

type OperationSummary = {
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

type GuardianMonitor = {
  pending_total: number
  pending_stale_24h: number
  failed_notifications: number
  recent_approved: number
  recent_denied: number
  recent_expired: number
  approval_rate: number
}

type ReleaseConfig = {
  featureFlags: Array<{ key: string; enabled: boolean; rollout_percent: number; owner: string }>
  postDeployChecks: Array<{ id: string; label: string; status: 'pending' | 'pass' | 'fail' }>
}

const lifecycleStatuses: LifecycleStatus[] = ['active', 'needs_attention', 'paused', 'planned']
const controlStatuses: ControlStatus[] = ['active', 'needs_attention', 'planned']

const formatDateTime = (value?: string | null) => {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'n/a'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const titleCase = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

export default function AdminOperationsPage() {
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<OperationsConfig | null>(null)
  const [summary, setSummary] = useState<OperationSummary | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskType, setNewTaskType] = useState('support_followup')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium')
  const [releaseConfig, setReleaseConfig] = useState<ReleaseConfig | null>(null)
  const [guardianMonitor, setGuardianMonitor] = useState<GuardianMonitor | null>(null)
  const [interventionUserId, setInterventionUserId] = useState('')
  const [interventionTier, setInterventionTier] = useState('')

  const loadOperations = useCallback(async () => {
    setLoading(true)
    const [operationsResponse, releaseResponse] = await Promise.all([
      fetch('/api/admin/operations'),
      fetch('/api/admin/release'),
    ])
    if (!operationsResponse.ok) {
      setToast('Unable to load operations.')
      setLoading(false)
      return
    }
    const payload = await operationsResponse.json()
    setConfig(payload.config || null)
    setSummary(payload.summary || null)
    setGuardianMonitor(payload.guardian_monitor || null)
    if (releaseResponse.ok) {
      const releasePayload = await releaseResponse.json().catch(() => null)
      setReleaseConfig(releasePayload?.config || null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadOperations()
  }, [loadOperations])

  useEffect(() => {
    const runMonitor = async () => {
      await fetch('/api/admin/operations/monitor', { method: 'POST' }).catch(() => null)
      await loadOperations()
    }
    void runMonitor()
  }, [loadOperations])

  const runAction = async (payload: Record<string, any>, successMessage: string) => {
    setSaving(true)
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setToast(data.error || 'Unable to update operations.')
      return
    }
    const data = await response.json()
    setConfig(data.config || null)
    setSummary(data.summary || null)
    setGuardianMonitor(data.guardian_monitor || null)
    setToast(successMessage)
  }

  const enqueueTask = async () => {
    if (!newTaskTitle.trim()) {
      setToast('Add a task title first.')
      return
    }
    await runAction(
      {
        action: 'enqueue_task',
        title: newTaskTitle.trim(),
        type: newTaskType,
        priority: newTaskPriority,
      },
      'Task added to operations queue.'
    )
    setNewTaskTitle('')
  }

  const runIntervention = async (action: string) => {
    if (!interventionUserId.trim()) {
      setToast('Enter a user id for intervention.')
      return
    }
    setSaving(true)
    const response = await fetch('/api/admin/operations/interventions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        user_id: interventionUserId.trim(),
        tier: interventionTier.trim() || null,
      }),
    })
    setSaving(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Intervention failed.')
      return
    }
    setToast('Intervention applied.')
  }

  const runOpsUtility = async (utility: 'billing_reconciliation' | 'support_sla' | 'release_verification') => {
    setSaving(true)
    if (utility === 'billing_reconciliation') {
      const response = await fetch('/api/admin/billing/reconciliation', { method: 'POST' })
      setSaving(false)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setToast(payload?.error || 'Billing reconciliation failed.')
        return
      }
      const payload = await response.json()
      await loadOperations()
      setToast(`Billing reconciliation queued ${payload.queued_tasks || 0} tasks.`)
      return
    }
    if (utility === 'support_sla') {
      const response = await fetch('/api/admin/support/sla', { method: 'POST' })
      setSaving(false)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setToast(payload?.error || 'SLA sweep failed.')
        return
      }
      const payload = await response.json()
      await loadOperations()
      setToast(`SLA sweep escalated ${payload.escalated || 0} tickets.`)
      return
    }
    const response = await fetch('/api/admin/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_release_verification', release_id: 'release-main' }),
    })
    setSaving(false)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Release verification failed to start.')
      return
    }
    await loadOperations()
    setToast('Release verification task queued.')
  }

  const setFlag = async (key: string, enabled: boolean, rolloutPercent: number) => {
    const response = await fetch('/api/admin/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_flag',
        key,
        enabled,
        rollout_percent: rolloutPercent,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Unable to update flag.')
      return
    }
    const payload = await response.json().catch(() => null)
    setReleaseConfig(payload?.config || null)
    setToast(`Updated ${key} flag.`)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Operations control center</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Lifecycle orchestration, queue retries, controls, and incident visibility.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => runAction({ action: 'process_due_tasks', limit: 20 }, 'Due tasks moved to processing.')}
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
          >
            Run queue sweep
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              const response = await fetch('/api/admin/operations/monitor', { method: 'POST' })
              setSaving(false)
              if (!response.ok) {
                setToast('Unable to run operational monitor.')
                return
              }
              await loadOperations()
              setToast('Operational monitor refreshed.')
            }}
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
          >
            Run monitor
          </button>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? <LoadingState label="Loading operations..." /> : null}

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Queue workload</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.queued_tasks || 0}</p>
                <p className="text-xs text-[#6b5f55]">queued + processing tasks</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Failed tasks</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.failed_tasks || 0}</p>
                <p className="text-xs text-[#6b5f55]">{summary?.overdue_tasks || 0} overdue</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Dead letters</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.dead_letter_tasks || 0}</p>
                <p className="text-xs text-[#6b5f55]">queue lag {summary?.queue_lag_minutes || 0}m</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Controls</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.controls_needing_attention || 0}</p>
                <p className="text-xs text-[#6b5f55]">need attention</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Incidents</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.open_incidents || 0}</p>
                <p className="text-xs text-[#6b5f55]">open or monitoring</p>
              </article>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Guardian pending</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{guardianMonitor?.pending_total || 0}</p>
                <p className="text-xs text-[#6b5f55]">requests waiting</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Stale 24h+</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{guardianMonitor?.pending_stale_24h || 0}</p>
                <p className="text-xs text-[#6b5f55]">needs escalation</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Notify failures</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{guardianMonitor?.failed_notifications || 0}</p>
                <p className="text-xs text-[#6b5f55]">email/in-app failures</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Approval rate</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{guardianMonitor?.approval_rate || 0}%</p>
                <p className="text-xs text-[#6b5f55]">last 30 days</p>
              </article>
            </section>

            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[#191919]">
              <Link className="rounded-full border border-[#191919] px-3 py-1" href="/admin/guardian-approvals">
                Open guardian approvals queue
              </Link>
              <Link className="rounded-full border border-[#191919] px-3 py-1" href="/admin/guardian-links">
                Open guardian links manager
              </Link>
            </div>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Task queue + retries</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">Retry or resolve operational failures in one place.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 md:grid-cols-[1fr_auto_auto_auto]">
                <input
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Add operational task"
                  className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                />
                <select
                  value={newTaskType}
                  onChange={(event) => setNewTaskType(event.target.value)}
                  className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="auth_recovery">Auth recovery</option>
                  <option value="billing_recovery">Billing recovery</option>
                  <option value="support_followup">Support follow-up</option>
                  <option value="release_validation">Release validation</option>
                  <option value="webhook_replay">Webhook replay</option>
                  <option value="lifecycle_repair">Lifecycle repair</option>
                </select>
                <select
                  value={newTaskPriority}
                  onChange={(event) => setNewTaskPriority(event.target.value as TaskPriority)}
                  className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <button
                  type="button"
                  onClick={enqueueTask}
                  disabled={saving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                >
                  Add task
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {(config?.taskQueue || []).map((task) => (
                  <article key={task.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{task.title}</p>
                        <p className="text-xs text-[#6b5f55]">
                          {titleCase(task.type)} · {task.owner}
                        </p>
                        <p className="text-xs text-[#6b5f55]">
                          Attempts {task.attempts}/{task.max_attempts} · Next run {formatDateTime(task.next_run_at)}
                        </p>
                        {task.last_error ? <p className="text-xs text-[#b80f0a]">Error: {task.last_error}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#191919] px-2 py-1 text-[11px] font-semibold text-[#191919]">
                          {titleCase(task.status)}
                        </span>
                        <span className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] text-[#6b5f55]">
                          {titleCase(task.priority)}
                        </span>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => runAction({ action: 'retry_task', task_id: task.id }, 'Task queued for retry.')}
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => runAction({ action: 'resolve_task', task_id: task.id }, 'Task marked complete.')}
                          className="rounded-full border border-[#191919] bg-[#191919] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Lifecycle orchestration</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Flow coverage and SLA ownership by stage.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {(config?.lifecycleStages || []).map((stage) => (
                    <article key={stage.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{stage.name}</p>
                          <p className="text-xs text-[#6b5f55]">Owner: {stage.owner} · SLA {stage.sla_minutes}m</p>
                        </div>
                        <select
                          value={stage.status}
                          onChange={(event) =>
                            runAction(
                              { action: 'set_lifecycle_status', stage_id: stage.id, status: event.target.value },
                              'Lifecycle stage updated.'
                            )
                          }
                          className="rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]"
                        >
                          {lifecycleStatuses.map((status) => (
                            <option key={status} value={status}>
                              {titleCase(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="mt-2 text-xs text-[#6b5f55]">{stage.description}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Operational controls</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Ownership status for the eight core operating gaps.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {(config?.controls || []).map((control) => (
                    <article key={control.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{control.title}</p>
                          <p className="text-xs text-[#6b5f55]">Owner: {control.owner}</p>
                        </div>
                        <select
                          value={control.status}
                          onChange={(event) =>
                            runAction(
                              { action: 'set_control_status', control_id: control.id, status: event.target.value },
                              'Control status updated.'
                            )
                          }
                          className="rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]"
                        >
                          {controlStatuses.map((status) => (
                            <option key={status} value={status}>
                              {titleCase(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="mt-2 text-xs text-[#6b5f55]">{control.description}</p>
                      <p className="mt-1 text-[11px] text-[#6b5f55]">Last reviewed {formatDateTime(control.last_reviewed)}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Admin interventions</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">
                Fix stuck lifecycle states, unlock users, and force logout without engineering deploys.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto_auto_auto_auto_auto]">
                <input
                  value={interventionUserId}
                  onChange={(event) => setInterventionUserId(event.target.value)}
                  placeholder="User id"
                  className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
                <input
                  value={interventionTier}
                  onChange={(event) => setInterventionTier(event.target.value)}
                  placeholder="Optional tier"
                  className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runIntervention('repair_role_plan_mismatch')}
                  className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Repair mismatch
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runIntervention('force_rerun_lifecycle')}
                  className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Re-run lifecycle
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runIntervention('unlock_user')}
                  className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Unlock user
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runIntervention('force_logout_user')}
                  className="rounded-full border border-[#191919] bg-[#191919] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Force logout
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runIntervention('mark_suspicious_login')}
                  className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Mark suspicious
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Ops automations</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">
                Trigger reconciliation, SLA escalation, and post-deploy verification jobs.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runOpsUtility('billing_reconciliation')}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Run billing reconciliation
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runOpsUtility('support_sla')}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Run support SLA sweep
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runOpsUtility('release_verification')}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Start release verification
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Release controls</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">
                Feature flags and staged rollout controls for safer deploys.
              </p>
              <div className="mt-4 space-y-3 text-sm">
                {(releaseConfig?.featureFlags || []).map((flag) => (
                  <article key={flag.key} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{flag.key}</p>
                        <p className="text-xs text-[#6b5f55]">Owner: {flag.owner}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={flag.rollout_percent}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            setReleaseConfig((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    featureFlags: prev.featureFlags.map((item) =>
                                      item.key === flag.key
                                        ? { ...item, rollout_percent: Number.isFinite(next) ? next : item.rollout_percent }
                                        : item
                                    ),
                                  }
                                : prev
                            )
                          }}
                          className="w-20 rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs text-[#191919]"
                        />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setFlag(flag.key, !flag.enabled, flag.rollout_percent)}
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                        >
                          {flag.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setFlag(flag.key, flag.enabled, flag.rollout_percent)}
                          className="rounded-full border border-[#191919] bg-[#191919] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Save rollout
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 space-y-3 text-sm">
                <h3 className="font-semibold text-[#191919]">Post-deploy checks</h3>
                {(releaseConfig?.postDeployChecks || []).map((check) => (
                  <article key={check.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-[#191919]">{check.label}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[#191919] px-2 py-1 text-[11px] font-semibold text-[#191919]">
                          {titleCase(check.status)}
                        </span>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            const response = await fetch('/api/admin/release', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'set_post_deploy_check',
                                check_id: check.id,
                                status: 'pass',
                              }),
                            })
                            if (!response.ok) {
                              const payload = await response.json().catch(() => null)
                              setToast(payload?.error || 'Unable to update check status.')
                              return
                            }
                            const payload = await response.json().catch(() => null)
                            setReleaseConfig(payload?.config || null)
                            setToast('Post-deploy check marked pass.')
                          }}
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                        >
                          Mark pass
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            const response = await fetch('/api/admin/release', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'set_post_deploy_check',
                                check_id: check.id,
                                status: 'fail',
                              }),
                            })
                            if (!response.ok) {
                              const payload = await response.json().catch(() => null)
                              setToast(payload?.error || 'Unable to update check status.')
                              return
                            }
                            const payload = await response.json().catch(() => null)
                            setReleaseConfig(payload?.config || null)
                            setToast('Post-deploy check marked fail.')
                          }}
                          className="rounded-full border border-[#191919] bg-[#191919] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Mark fail
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Incident feed</h2>
              <p className="mt-1 text-sm text-[#6b5f55]">Current operational incidents tied to flow outcomes.</p>
              <div className="mt-4 space-y-3 text-sm">
                {(config?.incidentFeed || []).map((incident) => (
                  <article key={incident.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-[#191919]">{incident.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] text-[#6b5f55]">
                          {titleCase(incident.severity)}
                        </span>
                        <span className="rounded-full border border-[#191919] px-2 py-1 text-[11px] font-semibold text-[#191919]">
                          {titleCase(incident.status)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[#6b5f55]">{incident.detail}</p>
                    <p className="mt-1 text-[11px] text-[#6b5f55]">{formatDateTime(incident.created_at)}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
