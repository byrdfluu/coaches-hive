'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'
import CreateMembershipModal from '@/components/CreateMembershipModal'
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
  metadata?: {
    sport?: string | null
    skill_level?: string | null
    max_athletes?: number | null
    session_frequency?: string | null
  } | null
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
  const [setupRequired, setSetupRequired] = useState(false)
  const [toast, setToast] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/coach/memberships')
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) {
      setLoading(false)
      return
    }
    setPlans((payload.plans || []) as MembershipPlan[])
    setMembers((payload.members || []) as MembershipMember[])
    setUsage((payload.usage || []) as MembershipUsage[])
    setMetrics((payload.metrics || null) as MembershipMetrics | null)
    setSetupRequired(Boolean(payload.setup_required))
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

  const openCreate = () => {
    setEditingPlan(null)
    setShowModal(true)
  }

  const openEdit = (plan: MembershipPlan) => {
    setEditingPlan(plan)
    setShowModal(true)
  }

  const handleModalSave = (saved: MembershipPlan) => {
    setPlans((prev) => {
      const exists = prev.some((p) => p.id === saved.id)
      if (!exists) return [saved, ...prev]
      return prev.map((p) => (p.id === saved.id ? saved : p))
    })
    setToast(saved.status === 'active' ? 'Membership published and Stripe price created.' : 'Membership saved.')
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

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6">
          <CoachSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Memberships</p>
                  <h1 className="mt-1 text-2xl font-semibold text-[#191919]">Programs</h1>
                </div>
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={setupRequired}
                  className="rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  + Create program
                </button>
              </div>
              {setupRequired ? (
                <div className="mt-5 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  <p className="font-semibold text-[#191919]">Supabase setup required</p>
                  <p className="mt-1">Run the coach membership tables migration before creating plans.</p>
                </div>
              ) : null}
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
                    activePlans.map((plan) => <PlanCard key={plan.id} plan={plan} onEdit={openEdit} onDelete={handleDelete} />)
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
                    draftPlans.map((plan) => <PlanCard key={plan.id} plan={plan} onEdit={openEdit} onDelete={handleDelete} />)
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
      {showModal ? (
        <CreateMembershipModal
          plan={editingPlan}
          onSave={handleModalSave}
          onClose={() => setShowModal(false)}
        />
      ) : null}
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
