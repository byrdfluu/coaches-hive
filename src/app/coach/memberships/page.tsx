'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type MembershipPlan = {
  id: string
  name: string
  description?: string | null
  price_cents: number
  currency: string
  billing_interval: string
  included_sessions: number
  stripe_product_id?: string | null
  stripe_price_id?: string | null
  status: 'draft' | 'active' | 'archived'
  created_at?: string | null
}

type MembershipMember = {
  id: string
  plan_id: string
  plan_name: string
  athlete_id: string
  athlete_name: string
  athlete_email?: string | null
  status: string
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  canceled_at?: string | null
  price_cents: number
  currency: string
  sessions_total: number
  sessions_used: number
  sessions_remaining: number
  created_at?: string | null
}

type MembershipUsage = {
  id: string
  subscription_id: string
  athlete_id?: string | null
  athlete_name: string
  plan_name: string
  session_id?: string | null
  usage_type: string
  quantity: number
  notes?: string | null
  created_at?: string | null
}

type MembershipMetrics = {
  active_members: number
  total_members: number
  monthly_recurring_revenue_cents: number
  sessions_used: number
  sessions_remaining: number
  issue_members: number
  canceled_or_past_due: MembershipMember[]
}

const formatCurrency = (cents: number, currency = 'usd') => {
  const amount = Number(cents || 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const statusClasses = (status: string) => {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'trialing') return 'border-[#1f7a3f] text-[#1f7a3f]'
  if (normalized === 'past_due' || normalized === 'unpaid') return 'border-[#b80f0a] text-[#b80f0a]'
  return 'border-[#6b5f55] text-[#6b5f55]'
}

export default function CoachMembershipsPage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [members, setMembers] = useState<MembershipMember[]>([])
  const [usage, setUsage] = useState<MembershipUsage[]>([])
  const [metrics, setMetrics] = useState<MembershipMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [name, setName] = useState('')
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [includedSessions, setIncludedSessions] = useState('10')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'active'>('draft')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const formRef = useRef<HTMLElement>(null)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/coach/memberships')
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) {
      setNotice(payload?.error || 'Unable to load membership plans.')
      setLoading(false)
      return
    }
    setPlans((payload.plans || []) as MembershipPlan[])
    setMembers((payload.members || []) as MembershipMember[])
    setUsage((payload.usage || []) as MembershipUsage[])
    setMetrics((payload.metrics || null) as MembershipMetrics | null)
    setSetupRequired(Boolean(payload.setup_required))
    setNotice(payload.setup_required ? payload.error || 'Coach memberships are not configured yet.' : '')
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  const activePlans = useMemo(() => plans.filter((plan) => plan.status === 'active'), [plans])
  const draftPlans = useMemo(() => plans.filter((plan) => plan.status === 'draft'), [plans])
  const activeMembers = useMemo(
    () => members.filter((member) => ['active', 'trialing'].includes(member.status.toLowerCase())),
    [members],
  )
  const issueMembers = metrics?.canceled_or_past_due || []

  const resetForm = () => {
    setName('')
    setMonthlyPrice('')
    setIncludedSessions('10')
    setDescription('')
    setStatus('draft')
    setEditingPlanId(null)
  }

  const startEditingPlan = (plan: MembershipPlan) => {
    setEditingPlanId(plan.id)
    setName(plan.name || '')
    setMonthlyPrice(String(Number(plan.price_cents || 0) / 100))
    setIncludedSessions(String(plan.included_sessions ?? 0))
    setDescription(plan.description || '')
    setStatus(plan.status === 'active' ? 'active' : 'draft')
    setNotice('')
    setToast('')
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleDelete = async (planId: string) => {
    const response = await fetch('/api/coach/memberships', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: planId }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setToast(payload?.error || 'Unable to delete membership plan.')
      return
    }
    setPlans((prev) => prev.filter((p) => p.id !== planId))
    setToast('Membership plan deleted.')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    setToast('')

    if (!name.trim()) {
      setNotice('Plan name is required.')
      return
    }
    if (!monthlyPrice.trim()) {
      setNotice('Monthly price is required.')
      return
    }

    setSaving(true)
    const response = await fetch('/api/coach/memberships', {
      method: editingPlanId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingPlanId,
        name: name.trim(),
        monthly_price: monthlyPrice.trim(),
        included_sessions: includedSessions.trim(),
        description: description.trim(),
        status,
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok || !payload?.plan) {
      setNotice(payload?.error || (editingPlanId ? 'Unable to update membership plan.' : 'Unable to save membership plan.'))
      return
    }

    setPlans((prev) => {
      const nextPlan = payload.plan as MembershipPlan
      if (!editingPlanId) return [nextPlan, ...prev]
      return prev.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
    })
    resetForm()
    setToast(
      editingPlanId
        ? 'Membership program updated.'
        : status === 'active'
          ? 'Membership published and Stripe price created.'
          : 'Membership draft saved.',
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6">
          <CoachSidebar />
          <div className="space-y-6">
            <section ref={formRef} className="glass-card border border-[#191919] bg-white p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Memberships</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {editingPlanId ? 'Edit program' : 'Create a program'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-[#4a4a4a]">
                  Set a total session count and price for your program. Publishing creates a matching Stripe product.
                  Athletes book ad-hoc — the platform tracks sessions used and remaining automatically.
                </p>
              </div>

              {setupRequired ? (
                <div className="mt-5 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  <p className="font-semibold text-[#191919]">Supabase setup required</p>
                  <p className="mt-1">Run the coach membership tables migration before creating plans.</p>
                </div>
              ) : null}

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-[#191919]">
                    <span>Program name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm font-normal text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="12-week skill development"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-semibold text-[#191919]">
                    <span>Price</span>
                    <input
                      value={monthlyPrice}
                      onChange={(event) => setMonthlyPrice(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm font-normal text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="$400"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-[#191919]">
                    <span>Total sessions in program</span>
                    <input
                      type="number"
                      min="0"
                      value={includedSessions}
                      onChange={(event) => setIncludedSessions(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm font-normal text-[#191919] outline-none focus:border-[#191919]"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-semibold text-[#191919]">
                    <span>Status</span>
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value as 'draft' | 'active')}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm font-normal text-[#191919] outline-none focus:border-[#191919]"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active / publish to Stripe</option>
                    </select>
                  </label>
                </div>

                <label className="block space-y-2 text-sm font-semibold text-[#191919]">
                  <span>Description / perks</span>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm font-normal text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="12 sessions of personalized skill development, weekly check-ins, and messaging access throughout the program."
                  />
                </label>

                {notice ? <p className="text-xs text-[#4a4a4a]">{notice}</p> : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="submit"
                    disabled={saving || setupRequired}
                    className="rounded-full bg-[#b80f0a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving
                      ? 'Saving...'
                      : editingPlanId
                        ? 'Save changes'
                        : status === 'active'
                          ? 'Publish program'
                          : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-[#191919] px-5 py-3 text-sm font-semibold text-[#191919]"
                  >
                    {editingPlanId ? 'Cancel edit' : 'Reset'}
                  </button>
                </div>
              </form>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Active members"
                value={loading ? '—' : String(metrics?.active_members || 0)}
                detail={`${metrics?.total_members || 0} total`}
              />
              <MetricCard
                label="Monthly revenue"
                value={loading ? '—' : formatCurrency(metrics?.monthly_recurring_revenue_cents || 0)}
                detail="active MRR"
              />
              <MetricCard
                label="Sessions used"
                value={loading ? '—' : String(metrics?.sessions_used || 0)}
                detail={`${metrics?.sessions_remaining || 0} remaining`}
              />
              <MetricCard
                label="Past due"
                value={loading ? '—' : String(members.filter((member) => ['past_due', 'unpaid'].includes(member.status.toLowerCase())).length)}
                detail="needs follow-up"
              />
              <MetricCard
                label="Cancelling"
                value={loading ? '—' : String(members.filter((member) => member.cancel_at_period_end).length)}
                detail="period-end cancels"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Active programs</h2>
                <div className="mt-4 space-y-3 text-sm">
                  {loading ? (
                    <LoadingState label="Loading programs..." />
                  ) : activePlans.length === 0 ? (
                    <EmptyState title="No active programs." description="Published programs will appear here." />
                  ) : (
                    activePlans.map((plan) => <PlanCard key={plan.id} plan={plan} onEdit={startEditingPlan} onDelete={handleDelete} />)
                  )}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Drafts</h2>
                <div className="mt-4 space-y-3 text-sm">
                  {loading ? (
                    <LoadingState label="Loading drafts..." />
                  ) : draftPlans.length === 0 ? (
                    <EmptyState title="No drafts." description="Save a draft before publishing to Stripe." />
                  ) : (
                    draftPlans.map((plan) => <PlanCard key={plan.id} plan={plan} onEdit={startEditingPlan} onDelete={handleDelete} />)
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#191919]">Active members</h2>
                    <p className="mt-1 text-xs text-[#4a4a4a]">Session counts and program progress per athlete.</p>
                  </div>
                  <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                    {activeMembers.length} active
                  </span>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {loading ? (
                    <LoadingState label="Loading members..." />
                  ) : activeMembers.length === 0 ? (
                    <EmptyState title="No active members." description="Athletes who subscribe to your active programs will appear here." />
                  ) : (
                    activeMembers.map((member) => (
                      <MemberRow key={member.id} member={member} onSessionsAdded={loadPlans} />
                    ))
                  )}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Cancellations / past due</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Members with billing risk or scheduled cancellation.</p>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {loading ? (
                    <LoadingState label="Loading billing status..." />
                  ) : issueMembers.length === 0 ? (
                    <EmptyState title="No billing issues." description="Past-due, canceled, and period-end cancellations will appear here." />
                  ) : (
                    issueMembers.map((member) => <MemberRow key={member.id} member={member} compact onSessionsAdded={loadPlans} />)
                  )}
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Session history</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Sessions used and returned from cancellations.</p>
                </div>
                <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  Last {usage.length}
                </span>
              </div>
              <div className="mt-4 overflow-x-auto">
                {loading ? (
                  <LoadingState label="Loading session history..." />
                ) : usage.length === 0 ? (
                  <EmptyState title="No session history yet." description="Activity appears when members book or cancel sessions." />
                ) : (
                  <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Athlete</th>
                        <th className="px-3 py-2">Program</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((entry) => (
                        <tr key={entry.id} className="rounded-2xl bg-[#f5f5f5]">
                          <td className="rounded-l-2xl px-3 py-3 text-[#4a4a4a]">{formatDate(entry.created_at)}</td>
                          <td className="px-3 py-3 font-semibold text-[#191919]">{entry.athlete_name}</td>
                          <td className="px-3 py-3 text-[#4a4a4a]">{entry.plan_name}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full border border-[#dcdcdc] px-2 py-1 text-xs font-semibold text-[#191919]">
                              {entry.usage_type === 'session_credit' ? 'session used' : entry.usage_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-[#191919]">{entry.quantity}</td>
                          <td className="rounded-r-2xl px-3 py-3 text-xs text-[#4a4a4a]">{entry.session_id || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-[#191919] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#191919]">{value}</p>
      <p className="mt-1 text-xs text-[#4a4a4a]">{detail}</p>
    </article>
  )
}

function MemberRow({
  member,
  compact = false,
  onSessionsAdded,
}: {
  member: MembershipMember
  compact?: boolean
  onSessionsAdded: () => void
}) {
  const [addingMode, setAddingMode] = useState(false)
  const [sessionsInput, setSessionsInput] = useState('1')
  const [addingLoading, setAddingLoading] = useState(false)
  const [addError, setAddError] = useState('')

  const handleAddSessions = async () => {
    const count = Number.parseInt(sessionsInput, 10)
    if (!Number.isFinite(count) || count < 1) {
      setAddError('Enter a number of 1 or more.')
      return
    }
    setAddingLoading(true)
    setAddError('')
    const response = await fetch('/api/coach/memberships/add-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_id: member.athlete_id, sessions_to_add: count }),
    })
    const payload = await response.json().catch(() => null)
    setAddingLoading(false)
    if (!response.ok) {
      setAddError(payload?.error || 'Unable to add sessions.')
      return
    }
    setAddingMode(false)
    setSessionsInput('1')
    onSessionsAdded()
  }

  return (
    <article className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#191919]">{member.athlete_name}</p>
          <p className="mt-1 text-xs text-[#4a4a4a]">{member.plan_name}</p>
          {member.athlete_email ? <p className="mt-1 text-xs text-[#4a4a4a]">{member.athlete_email}</p> : null}
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize ${statusClasses(member.status)}`}>
          {member.cancel_at_period_end ? 'canceling' : member.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[#4a4a4a] sm:grid-cols-3">
        <span className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
          {member.sessions_remaining} of {member.sessions_total} sessions left
        </span>
        <span className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
          Renews {formatDate(member.current_period_end)}
        </span>
        <span className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
          {formatCurrency(member.price_cents, member.currency)} / month
        </span>
      </div>
      {!compact && (
        <div className="mt-3">
          {addingMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={sessionsInput}
                onChange={(e) => setSessionsInput(e.target.value)}
                className="w-20 rounded-xl border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs font-semibold text-[#191919] outline-none focus:border-[#191919]"
              />
              <button
                type="button"
                onClick={handleAddSessions}
                disabled={addingLoading}
                className="rounded-full bg-[#191919] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {addingLoading ? 'Saving...' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => { setAddingMode(false); setAddError('') }}
                className="text-xs font-semibold text-[#4a4a4a] underline underline-offset-2"
              >
                Cancel
              </button>
              {addError ? <span className="text-xs text-[#b80f0a]">{addError}</span> : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingMode(true)}
              className="text-xs font-semibold text-[#191919] underline underline-offset-2"
            >
              + Add sessions
            </button>
          )}
        </div>
      )}
      {!compact && member.cancel_at_period_end ? (
        <p className="mt-2 text-xs font-semibold text-[#b80f0a]">Cancels at period end.</p>
      ) : null}
    </article>
  )
}

function PlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: MembershipPlan
  onEdit: (plan: MembershipPlan) => void
  onDelete: (planId: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteConfirm = async () => {
    setDeleting(true)
    await onDelete(plan.id)
    setDeleting(false)
    setConfirmDelete(false)
  }

  return (
    <article className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#191919]">{plan.name}</p>
          <p className="mt-1 text-xs text-[#4a4a4a]">
            {formatCurrency(plan.price_cents, plan.currency)} / {plan.billing_interval}
            {' '}· {plan.included_sessions} session{plan.included_sessions === 1 ? '' : 's'} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="rounded-full border border-[#b80f0a] px-3 py-1 text-[11px] font-semibold text-[#b80f0a] disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919] disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onEdit(plan)}
                className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-full border border-[#b80f0a] px-3 py-1 text-[11px] font-semibold text-[#b80f0a]"
              >
                Delete
              </button>
              <span className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold capitalize text-[#191919]">
                {plan.status}
              </span>
            </>
          )}
        </div>
      </div>
      {plan.description ? <p className="mt-3 text-xs leading-5 text-[#4a4a4a]">{plan.description}</p> : null}
      {plan.stripe_price_id ? (
        <p className="mt-3 text-[11px] text-[#4a4a4a]">Stripe price: {plan.stripe_price_id}</p>
      ) : null}
    </article>
  )
}
