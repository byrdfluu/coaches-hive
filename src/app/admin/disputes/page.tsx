'use client'

import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { useEffect, useMemo, useState } from 'react'

type OrderRow = {
  id: string
  coach_id?: string | null
  athlete_id?: string | null
  org_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  status?: string | null
  refund_status?: string | null
  payment_intent_id?: string | null
  created_at?: string | null
  dispute_reason?: string | null
  dispute_status?: string | null
  dispute_deadline?: string | null
}

type DisputePagination = {
  page: number
  page_size: number
  total: number
  has_next: boolean
}

type DisputePermissions = {
  can_manage: boolean
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : `$${parsed.toFixed(2).replace(/\\.00$/, '')}`
  }
  return `$${value.toFixed(2).replace(/\\.00$/, '')}`
}

const getStatusLabel = (status: string) => {
  const normalized = status.toLowerCase()
  if (normalized === 'refunded') return 'Refunded'
  if (normalized === 'disputed') return 'Disputed'
  if (normalized === 'needs_response') return 'Needs response'
  if (normalized === 'under_review') return 'Under review'
  if (normalized === 'won') return 'Won'
  if (normalized === 'lost') return 'Lost'
  if (normalized === 'chargeback') return 'Chargeback'
  if (normalized === 'resolved') return 'Resolved'
  if (normalized === 'warning') return 'Warning'
  return 'Open'
}

const getDeadlineBadge = (deadline?: string | null) => {
  if (!deadline) return null
  const due = new Date(deadline)
  if (Number.isNaN(due.getTime())) return null
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const days = Math.ceil(diffMs / 86400000)
  if (days < 0) {
    return { label: 'Past due', tone: 'bg-[#1f1c18] text-white' }
  }
  if (days <= 2) {
    return { label: `Action needed · ${days}d`, tone: 'bg-[#b80f0a] text-white' }
  }
  if (days <= 7) {
    return { label: `Action needed · ${days}d`, tone: 'bg-[#f2d2d2] text-[#191919]' }
  }
  return { label: `Due in ${days}d`, tone: 'bg-[#f5f5f5] text-[#191919]' }
}

export default function AdminDisputesPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [coaches, setCoaches] = useState<Record<string, { name: string; email: string }>>({})
  const [athletes, setAthletes] = useState<Record<string, { name: string; email: string }>>({})
  const [orgs, setOrgs] = useState<Record<string, string>>({})
  const [pagination, setPagination] = useState<DisputePagination>({ page: 1, page_size: 25, total: 0, has_next: false })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [refundingId, setRefundingId] = useState('')
  const [disputeActionLoading, setDisputeActionLoading] = useState('')
  const [toast, setToast] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null)
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(true)
  const [autoRefundLimit, setAutoRefundLimit] = useState(50)
  const [autoNotifyEnabled, setAutoNotifyEnabled] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [permissions, setPermissions] = useState<DisputePermissions>({ can_manage: false })

  useEffect(() => {
    let active = true
    const loadDisputes = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch(`/api/admin/disputes?page=${page}&page_size=25`)
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load disputes.')
          setToast('Unable to load disputes.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      setOrders(payload.orders || [])
      setCoaches(payload.coaches || {})
      setAthletes(payload.athletes || {})
      setOrgs(payload.orgs || {})
      setPagination({
        page: Number(payload.pagination?.page || page),
        page_size: Number(payload.pagination?.page_size || 25),
        total: Number(payload.pagination?.total || 0),
        has_next: Boolean(payload.pagination?.has_next),
      })
      setPermissions({
        can_manage: Boolean(payload.permissions?.can_manage),
      })
      if (payload.settings) {
        setAutoResolveEnabled(Boolean(payload.settings.autoResolveEnabled))
        setAutoRefundLimit(Number(payload.settings.autoRefundLimit || 0))
        setAutoNotifyEnabled(Boolean(payload.settings.autoNotifyEnabled))
      }
      setLoading(false)
    }
    loadDisputes()
    return () => {
      active = false
    }
  }, [page])

  const persistSettings = async (next: { autoResolveEnabled: boolean; autoRefundLimit: number; autoNotifyEnabled: boolean }) => {
    setSettingsSaving(true)
    const response = await fetch('/api/admin/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: next }),
    })
    if (!response.ok) {
      setToast('Unable to save dispute settings.')
      setSettingsSaving(false)
      return
    }
    setSettingsSaving(false)
  }

  const refundsQueue = useMemo(() => {
    return orders.filter((order) => String(order.status || '').toLowerCase() !== 'refunded')
  }, [orders])

  const disputeSummary = useMemo(() => {
    const refunded = orders.filter((order) => String(order.refund_status || '').toLowerCase() === 'refunded').length
    const disputed = orders.filter((order) => {
      const status = String(order.status || '').toLowerCase()
      return status.includes('dispute') || status.includes('chargeback')
    }).length
    return { open: refundsQueue.length, refunded, disputed }
  }, [orders, refundsQueue])

  const handleRefund = async (order: OrderRow) => {
    if (!order.payment_intent_id) {
      setNotice('No payment intent on this order.')
      setToast('No payment intent on this order.')
      return
    }
    setRefundingId(order.id)
    setNotice('')
    const response = await fetch('/api/payments/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_intent: order.payment_intent_id, order_id: order.id, reason: 'requested_by_customer' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setNotice(payload?.error || 'Unable to refund order.')
      setToast(payload?.error || 'Unable to refund order.')
      setRefundingId('')
      return
    }
    setOrders((prev) => prev.map((item) => (item.id === order.id ? { ...item, status: 'refunded', refund_status: 'refunded' } : item)))
    setSelectedOrder((prev) =>
      prev && prev.id === order.id ? { ...prev, status: 'refunded', refund_status: 'refunded' } : prev,
    )
    setToast('Refund issued')
    setRefundingId('')
  }

  const handleDisputeAction = async (
    order: OrderRow,
    action: 'submit_evidence' | 'mark_won' | 'mark_lost' | 'reopen',
  ) => {
    setDisputeActionLoading(`${order.id}:${action}`)
    const response = await fetch('/api/admin/disputes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, action }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setNotice(payload?.error || 'Unable to update dispute.')
      setToast(payload?.error || 'Unable to update dispute.')
      setDisputeActionLoading('')
      return
    }

    const nextOrder = payload?.order || {}
    setOrders((prev) => prev.map((item) => (item.id === order.id ? { ...item, ...nextOrder } : item)))
    setSelectedOrder((prev) => (prev && prev.id === order.id ? { ...prev, ...nextOrder } : prev))
    setToast(
      action === 'submit_evidence'
        ? 'Dispute marked under review.'
        : action === 'mark_won'
        ? 'Dispute marked won.'
        : action === 'mark_lost'
        ? 'Dispute marked lost.'
        : 'Dispute reopened.',
    )
    setDisputeActionLoading('')
  }

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.page_size || 25)))

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div>
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Disputes</p>
                <h1 className="display text-3xl font-semibold text-[#191919]">Open disputes</h1>
                <p className="mt-2 text-sm text-[#6b5f55]">Track chargebacks and refunds.</p>
              </div>
              <Link href="/admin" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                Back to admin
              </Link>
            </header>

            <section className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { label: 'Open disputes', value: disputeSummary.open.toString() },
                { label: 'Disputed', value: disputeSummary.disputed.toString() },
                { label: 'Refunded', value: disputeSummary.refunded.toString() },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="mt-4 glass-card border border-[#191919] bg-white p-6 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Dispute automation</h2>
                  <p className="text-sm text-[#6b5f55]">Auto-handle low-risk cases and notify stakeholders.</p>
                </div>
                <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  {!permissions.can_manage ? 'View only' : autoResolveEnabled ? 'Automation on' : 'Automation off'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <span className="font-semibold text-[#191919]">Auto-resolve low-value disputes</span>
                  <input
                    type="checkbox"
                    checked={autoResolveEnabled}
                    disabled={!permissions.can_manage}
                    onChange={(event) => {
                      const next = event.target.checked
                      setAutoResolveEnabled(next)
                      persistSettings({ autoResolveEnabled: next, autoRefundLimit, autoNotifyEnabled })
                    }}
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <span className="font-semibold text-[#191919]">Auto-refund limit ($)</span>
                  <input
                    type="number"
                    min={0}
                    value={autoRefundLimit}
                    disabled={!permissions.can_manage}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setAutoRefundLimit(next)
                      persistSettings({ autoResolveEnabled, autoRefundLimit: next, autoNotifyEnabled })
                    }}
                    className="w-20 rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-sm text-[#191919]"
                  />
                </label>
                <label className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <span className="font-semibold text-[#191919]">Notify coaches + orgs</span>
                  <input
                    type="checkbox"
                    checked={autoNotifyEnabled}
                    disabled={!permissions.can_manage}
                    onChange={(event) => {
                      const next = event.target.checked
                      setAutoNotifyEnabled(next)
                      persistSettings({ autoResolveEnabled, autoRefundLimit, autoNotifyEnabled: next })
                    }}
                  />
                </label>
              </div>
              {settingsSaving ? (
                <p className="mt-2 text-xs text-[#6b5f55]">Saving dispute settings...</p>
              ) : !permissions.can_manage ? (
                <p className="mt-2 text-xs text-[#6b5f55]">You have view-only access to disputes.</p>
              ) : null}
            </section>

            <section className="mt-8 space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={loading || page <= 1}
                >
                  Prev
                </button>
                <span className="text-xs font-semibold text-[#6b5f55]">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={loading || !pagination.has_next}
                >
                  Next
                </button>
              </div>
              {notice ? <p className="text-xs text-[#6b5f55]">{notice}</p> : null}
              {loading ? (
                <LoadingState label="Loading disputes..." />
              ) : refundsQueue.length === 0 ? (
                <EmptyState title="No disputes or refunds to review." description="Incoming issues will show up here." />
              ) : (
                refundsQueue.map((order) => {
                  const coach = order.coach_id ? coaches[order.coach_id]?.name || 'Coach' : 'Org'
                  const athlete = order.athlete_id ? athletes[order.athlete_id]?.name || 'Athlete' : 'Athlete'
                  const org = order.org_id ? orgs[order.org_id] || 'Organization' : ''
                  const amount = formatCurrency(order.amount ?? order.total ?? order.price)
                  const status = getStatusLabel(String(order.refund_status || order.status || 'open'))
                  const disputeLabel = order.dispute_status ? getStatusLabel(String(order.dispute_status)) : null
                  const deadlineLabel = order.dispute_deadline
                    ? new Date(order.dispute_deadline).toLocaleDateString()
                    : null
                  const deadlineBadge = getDeadlineBadge(order.dispute_deadline)
                  return (
                    <div key={order.id} className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{order.id}</p>
                        <p className="text-xs text-[#6b5f55]">
                          {coach} · {athlete} {org ? `· ${org}` : ''}
                        </p>
                        <p className="text-xs text-[#6b5f55]">{order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}</p>
                        {order.dispute_reason || disputeLabel || deadlineLabel ? (
                          <p className="text-xs text-[#6b5f55]">
                            {disputeLabel ? `Dispute: ${disputeLabel}` : 'Dispute'}
                            {order.dispute_reason ? ` · ${order.dispute_reason}` : ''}
                            {deadlineLabel ? ` · Evidence due ${deadlineLabel}` : ''}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{status}</span>
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{amount}</span>
                        {deadlineBadge ? (
                          <span className={`rounded-full px-3 py-1 font-semibold ${deadlineBadge.tone}`}>
                            {deadlineBadge.label}
                          </span>
                        ) : null}
                        <button
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                          onClick={() => setSelectedOrder(order)}
                        >
                          View dispute
                        </button>
                        <button
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                          disabled={!permissions.can_manage || !order.payment_intent_id || refundingId === order.id}
                          onClick={() => handleRefund(order)}
                        >
                          {refundingId === order.id ? 'Refunding...' : 'Issue refund'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </section>
          </div>
        </div>
      </div>
      {selectedOrder ? (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Dispute details</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selectedOrder.id}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Status</p>
                <p className="mt-2 text-sm font-semibold text-[#191919]">
                  {getStatusLabel(String(selectedOrder.dispute_status || selectedOrder.refund_status || selectedOrder.status || 'open'))}
                </p>
                {selectedOrder.dispute_reason ? (
                  <p className="mt-1 text-xs text-[#6b5f55]">Reason: {selectedOrder.dispute_reason}</p>
                ) : null}
                {selectedOrder.dispute_deadline ? (
                  <p className="mt-1 text-xs text-[#6b5f55]">
                    Evidence due: {new Date(selectedOrder.dispute_deadline).toLocaleDateString()}
                  </p>
                ) : null}
                {getDeadlineBadge(selectedOrder.dispute_deadline) ? (
                  <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getDeadlineBadge(selectedOrder.dispute_deadline)?.tone}`}>
                    {getDeadlineBadge(selectedOrder.dispute_deadline)?.label}
                  </span>
                ) : null}
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Parties</p>
                <p className="mt-2">
                  Coach: {selectedOrder.coach_id ? coaches[selectedOrder.coach_id]?.name || 'Coach' : 'Org'}
                </p>
                <p>
                  Athlete: {selectedOrder.athlete_id ? athletes[selectedOrder.athlete_id]?.name || 'Athlete' : 'Athlete'}
                </p>
                {selectedOrder.org_id ? (
                  <p>Org: {orgs[selectedOrder.org_id] || 'Organization'}</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Payment</p>
                <p className="mt-2">Amount: {formatCurrency(selectedOrder.amount ?? selectedOrder.total ?? selectedOrder.price)}</p>
                <p>Payment intent: {selectedOrder.payment_intent_id || '—'}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Actions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                    onClick={() => handleDisputeAction(selectedOrder, 'submit_evidence')}
                    disabled={!permissions.can_manage || Boolean(disputeActionLoading)}
                  >
                    {disputeActionLoading === `${selectedOrder.id}:submit_evidence` ? 'Saving...' : 'Evidence submitted'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                    onClick={() => handleDisputeAction(selectedOrder, 'mark_won')}
                    disabled={!permissions.can_manage || Boolean(disputeActionLoading)}
                  >
                    {disputeActionLoading === `${selectedOrder.id}:mark_won` ? 'Saving...' : 'Mark won'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                    onClick={() => handleDisputeAction(selectedOrder, 'mark_lost')}
                    disabled={!permissions.can_manage || Boolean(disputeActionLoading)}
                  >
                    {disputeActionLoading === `${selectedOrder.id}:mark_lost` ? 'Saving...' : 'Mark lost'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                    onClick={() => handleDisputeAction(selectedOrder, 'reopen')}
                    disabled={!permissions.can_manage || Boolean(disputeActionLoading)}
                  >
                    {disputeActionLoading === `${selectedOrder.id}:reopen` ? 'Saving...' : 'Reopen'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
