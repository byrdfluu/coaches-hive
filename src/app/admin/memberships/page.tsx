'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type AdminMembership = {
  id: string
  plan_name: string
  coach_name: string
  coach_email?: string | null
  athlete_name: string
  athlete_email?: string | null
  status: string
  current_period_end?: string | null
  cancel_at_period_end: boolean
  stripe_subscription_id?: string | null
  price_cents: number
  currency: string
  credit_total: number
  credit_used: number
  credit_remaining: number
  created_at?: string | null
}

type AdminMembershipMetrics = {
  total: number
  active: number
  failed_payments: number
  cancellations: number
  remaining_credits: number
  used_credits: number
  monthly_revenue_cents: number
}

const statuses = ['all', 'active', 'trialing', 'failed', 'cancellations', 'past_due', 'unpaid', 'canceled', 'paused', 'expired']
const adjustableStatuses = ['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'expired']

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

const badgeClass = (status: string) => {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'trialing') return 'border-[#1f7a3f] text-[#1f7a3f]'
  if (normalized === 'past_due' || normalized === 'unpaid') return 'border-[#b80f0a] text-[#b80f0a]'
  return 'border-[#6b5f55] text-[#6b5f55]'
}

export default function AdminMembershipsPage() {
  const [memberships, setMemberships] = useState<AdminMembership[]>([])
  const [metrics, setMetrics] = useState<AdminMembershipMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<AdminMembership | null>(null)
  const [nextStatus, setNextStatus] = useState('active')
  const [creditDelta, setCreditDelta] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [saving, setSaving] = useState(false)

  const loadMemberships = async () => {
    setLoading(true)
    setNotice('')
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (status !== 'all') params.set('status', status)
    const response = await fetch(`/api/admin/memberships?${params.toString()}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) {
      setNotice(payload?.error || 'Unable to load membership subscriptions.')
      setLoading(false)
      return
    }
    setMemberships((payload.memberships || []) as AdminMembership[])
    setMetrics((payload.metrics || null) as AdminMembershipMetrics | null)
    setNotice(payload.setup_required ? 'Membership tables are not configured yet.' : '')
    setLoading(false)
  }

  useEffect(() => {
    void loadMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const failedPayments = useMemo(
    () => memberships.filter((membership) => ['past_due', 'unpaid'].includes(membership.status.toLowerCase())),
    [memberships],
  )
  const cancellations = useMemo(
    () => memberships.filter((membership) => membership.status.toLowerCase() === 'canceled' || membership.cancel_at_period_end),
    [memberships],
  )

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    void loadMemberships()
  }

  const runAction = async (payload: Record<string, unknown>, successMessage: string) => {
    if (!selected) return
    setSaving(true)
    const response = await fetch('/api/admin/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: selected.id, ...payload }),
    })
    const data = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) {
      setNotice(data?.error || 'Unable to update membership.')
      return
    }
    setToast(successMessage)
    setSelected(null)
    setCreditDelta('')
    setAdjustmentNote('')
    await loadMemberships()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin</p>
                  <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Membership subscriptions</h1>
                  <p className="mt-2 max-w-2xl text-sm text-[#4a4a4a]">
                    Lookup coach memberships, monitor payment failures and cancellations, and make support adjustments.
                  </p>
                </div>
              </div>
              {notice ? <p className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">{notice}</p> : null}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Total" value={String(metrics?.total || 0)} detail="subscriptions" />
              <MetricCard label="Active" value={String(metrics?.active || 0)} detail="active/trialing" />
              <MetricCard label="MRR" value={formatCurrency(metrics?.monthly_revenue_cents || 0)} detail="active plans" />
              <MetricCard label="Failed" value={String(metrics?.failed_payments || 0)} detail="past due/unpaid" />
              <MetricCard label="Cancellations" value={String(metrics?.cancellations || 0)} detail="ended/canceling" />
              <MetricCard label="Credits" value={String(metrics?.remaining_credits || 0)} detail={`${metrics?.used_credits || 0} used`} />
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" onSubmit={handleSearch}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search coach, athlete, email, plan, or status"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <button type="submit" className="rounded-full bg-[#b80f0a] px-5 py-3 text-sm font-semibold text-white">
                  Search
                </button>
              </form>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <IssuePanel title="Failed payments" rows={failedPayments} empty="No failed membership payments." onSelect={setSelected} />
              <IssuePanel title="Cancellations" rows={cancellations} empty="No canceled or canceling memberships." onSelect={setSelected} />
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#191919]">All memberships</h2>
                <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">{memberships.length} shown</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                {loading ? (
                  <LoadingState label="Loading memberships..." />
                ) : memberships.length === 0 ? (
                  <EmptyState title="No memberships found." description="Adjust filters or search by coach/athlete." />
                ) : (
                  <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">
                      <tr>
                        <th className="px-3 py-2">Athlete</th>
                        <th className="px-3 py-2">Coach</th>
                        <th className="px-3 py-2">Plan</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Credits</th>
                        <th className="px-3 py-2">Renews / ends</th>
                        <th className="px-3 py-2">Stripe</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberships.map((membership) => (
                        <tr key={membership.id} className="bg-[#f5f5f5]">
                          <td className="rounded-l-2xl px-3 py-3">
                            <p className="font-semibold text-[#191919]">{membership.athlete_name}</p>
                            <p className="text-xs text-[#4a4a4a]">{membership.athlete_email || membership.id}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-[#191919]">{membership.coach_name}</p>
                            <p className="text-xs text-[#4a4a4a]">{membership.coach_email || '—'}</p>
                          </td>
                          <td className="px-3 py-3">{membership.plan_name}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${badgeClass(membership.status)}`}>
                              {membership.cancel_at_period_end ? 'canceling' : membership.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-3">{membership.credit_remaining}/{membership.credit_total}</td>
                          <td className="px-3 py-3">{formatDate(membership.current_period_end)}</td>
                          <td className="px-3 py-3 text-xs text-[#4a4a4a]">{membership.stripe_subscription_id || '—'}</td>
                          <td className="rounded-r-2xl px-3 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(membership)
                                setNextStatus(membership.status)
                              }}
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              Adjust
                            </button>
                          </td>
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

      {selected ? (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-4 sm:items-center sm:py-10">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Support adjustment</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selected.athlete_name}</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{selected.plan_name} with {selected.coach_name}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-full border border-[#191919] px-3 py-1 text-sm font-semibold text-[#191919]">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-sm font-semibold text-[#191919]">Update status</p>
                <select
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value)}
                  className="mt-3 w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                >
                  {adjustableStatuses.map((item) => (
                    <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runAction({ action: 'update_status', status: nextStatus }, 'Membership status updated.')}
                  className="mt-3 rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Save status
                </button>
              </div>

              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-sm font-semibold text-[#191919]">Adjust credits</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">Current: {selected.credit_remaining}/{selected.credit_total}</p>
                <input
                  value={creditDelta}
                  onChange={(event) => setCreditDelta(event.target.value)}
                  placeholder="+1 or -1"
                  className="mt-3 w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                />
                <input
                  value={adjustmentNote}
                  onChange={(event) => setAdjustmentNote(event.target.value)}
                  placeholder="Support note"
                  className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => runAction({ action: 'adjust_credits', credit_delta: creditDelta, notes: adjustmentNote }, 'Membership credits adjusted.')}
                  className="mt-3 rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Apply credit adjustment
                </button>
              </div>
            </div>
          </div>
        </div>
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

function IssuePanel({
  title,
  rows,
  empty,
  onSelect,
}: {
  title: string
  rows: AdminMembership[]
  empty: string
  onSelect: (membership: AdminMembership) => void
}) {
  return (
    <section className="glass-card border border-[#191919] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#191919]">{title}</h2>
        <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">{rows.length}</span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <EmptyState title={empty} description="Support queues will populate when memberships need attention." />
        ) : (
          rows.slice(0, 6).map((membership) => (
            <article key={membership.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#191919]">{membership.athlete_name}</p>
                  <p className="text-xs text-[#4a4a4a]">{membership.plan_name} · {membership.coach_name}</p>
                </div>
                <button type="button" onClick={() => onSelect(membership)} className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  Adjust
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
