'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'

type WorkflowStatus = 'scheduled' | 'on_hold' | 'paid' | 'failed'

type PayoutRow = {
  id: string
  coach_id: string
  coach: string
  coach_email: string
  amount: number
  status: string
  workflow_status: WorkflowStatus
  scheduled_for?: string | null
  created_at?: string | null
  updated_at?: string | null
  paid_at?: string | null
  session_payment_id?: string | null
  payment_method?: string | null
  payment_status?: string | null
  payment_paid_at?: string | null
  bank_last4?: string | null
  failure_reason?: string | null
}

type PayoutSummary = {
  total_count: number
  total_amount: number
  scheduled_count: number
  on_hold_count: number
  paid_count: number
  failed_count: number
}

type PayoutPagination = {
  page: number
  page_size: number
  total: number
  has_next: boolean
}

type ReconciliationState = {
  last_run_at?: string | null
  mismatch_count: number
  mismatch_sample_ids?: string[]
  last_run_by?: string | null
  live_mismatch_count?: number
}

type Filters = {
  query: string
  status: 'all' | WorkflowStatus
  date_from: string
  date_to: string
}

type ConfirmAction = {
  action:
    | 'mark_paid'
    | 'mark_failed'
    | 'retry'
    | 'set_hold'
    | 'release_hold'
    | 'reconcile'
  title: string
  message: string
  confirm_label: string
  payout?: PayoutRow
  note: string
  require_note?: boolean
}

const formatCurrency = (value: number | string | null | undefined) => {
  const amount = Number(value ?? NaN)
  if (!Number.isFinite(amount)) return '$0'
  return `$${amount.toFixed(2).replace(/\.00$/, '')}`
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const statusLabel = (status: WorkflowStatus) => {
  if (status === 'on_hold') return 'On hold'
  if (status === 'paid') return 'Paid'
  if (status === 'failed') return 'Failed'
  return 'Scheduled'
}

const statusTone = (status: WorkflowStatus) => {
  if (status === 'on_hold') return 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
  if (status === 'paid') return 'border-[#191919] bg-[#191919] text-white'
  if (status === 'failed') return 'border-[#b80f0a] bg-[#f2d2d2] text-[#191919]'
  return 'border-[#191919] bg-white text-[#191919]'
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [summary, setSummary] = useState<PayoutSummary>({
    total_count: 0,
    total_amount: 0,
    scheduled_count: 0,
    on_hold_count: 0,
    paid_count: 0,
    failed_count: 0,
  })
  const [reconciliation, setReconciliation] = useState<ReconciliationState>({
    mismatch_count: 0,
  })
  const [pagination, setPagination] = useState<PayoutPagination>({
    page: 1,
    page_size: 25,
    total: 0,
    has_next: false,
  })
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>({
    query: '',
    status: 'all',
    date_from: '',
    date_to: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    query: '',
    status: 'all',
    date_from: '',
    date_to: '',
  })
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [detailsPayout, setDetailsPayout] = useState<PayoutRow | null>(null)
  const [toast, setToast] = useState('')

  const loadPayouts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      page_size: '25',
    })
    if (appliedFilters.query.trim()) params.set('query', appliedFilters.query.trim())
    if (appliedFilters.status !== 'all') params.set('status', appliedFilters.status)
    if (appliedFilters.date_from) params.set('date_from', appliedFilters.date_from)
    if (appliedFilters.date_to) params.set('date_to', appliedFilters.date_to)

    const response = await fetch(`/api/admin/payouts?${params.toString()}`)
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setToast(payload?.error || 'Unable to load payouts.')
      setLoading(false)
      return
    }

    setPayouts(payload.payouts || [])
    setSummary(payload.summary || {
      total_count: 0,
      total_amount: 0,
      scheduled_count: 0,
      on_hold_count: 0,
      paid_count: 0,
      failed_count: 0,
    })
    setReconciliation(payload.reconciliation || { mismatch_count: 0 })
    setPagination({
      page: Number(payload.pagination?.page || page),
      page_size: Number(payload.pagination?.page_size || 25),
      total: Number(payload.pagination?.total || 0),
      has_next: Boolean(payload.pagination?.has_next),
    })
    setLoading(false)
  }, [appliedFilters, page])

  useEffect(() => {
    loadPayouts()
  }, [loadPayouts])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.page_size || 25))),
    [pagination],
  )

  const openConfirm = (next: Omit<ConfirmAction, 'note'> & { note?: string }) => {
    setConfirmAction({ ...next, note: next.note || '' })
  }

  const submitAction = async (nextAction?: ConfirmAction) => {
    const actionToRun = nextAction || confirmAction
    if (!actionToRun) return

    if (actionToRun.require_note && !actionToRun.note.trim()) {
      setToast('Add a reason before confirming this action.')
      return
    }

    const actionKey = actionToRun.payout
      ? `${actionToRun.action}:${actionToRun.payout.id}`
      : actionToRun.action

    setActionLoadingId(actionKey)

    const response = await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payout_id: actionToRun.payout?.id,
        action: actionToRun.action,
        note: actionToRun.note,
      }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setToast(payload?.error || 'Unable to update payout.')
      setActionLoadingId('')
      return
    }

    setToast('Payout action saved.')
    setConfirmAction(null)
    setActionLoadingId('')
    await loadPayouts()
  }

  const renderActions = (payout: PayoutRow) => {
    const isOnHold = payout.workflow_status === 'on_hold'
    const isPaid = payout.workflow_status === 'paid'
    const isFailed = payout.workflow_status === 'failed'
    const rowBusy = actionLoadingId.includes(`:${payout.id}`)

    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
          onClick={() => setDetailsPayout(payout)}
        >
          View details
        </button>

        {!isPaid ? (
          <button
            type="button"
            className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
            disabled={rowBusy || isOnHold}
            onClick={() => openConfirm({
              action: 'mark_paid',
              payout,
              title: 'Mark payout paid',
              message: isOnHold
                ? 'Release hold before paying this payout.'
                : 'This marks the payout as paid and logs the action.',
              confirm_label: 'Mark paid',
            })}
          >
            Mark paid
          </button>
        ) : null}

        {!isPaid ? (
          <button
            type="button"
            className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
            disabled={rowBusy}
            onClick={() =>
              openConfirm({
                action: 'mark_failed',
                payout,
                title: 'Mark payout failed',
                message: 'Add a reason and mark this payout as failed.',
                confirm_label: 'Mark failed',
                require_note: true,
              })
            }
          >
            Mark failed
          </button>
        ) : null}

        {isFailed ? (
          <button
            type="button"
            className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
            disabled={rowBusy}
            onClick={() =>
              openConfirm({
                action: 'retry',
                payout,
                title: 'Retry payout',
                message: 'This moves payout back to scheduled for reprocessing.',
                confirm_label: 'Retry payout',
              })
            }
          >
            Retry
          </button>
        ) : null}

        {!isPaid ? (
          isOnHold ? (
            <button
              type="button"
              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
              disabled={rowBusy}
              onClick={() =>
                openConfirm({
                  action: 'release_hold',
                  payout,
                  title: 'Release hold',
                  message: 'This unlocks payout actions for this payout.',
                  confirm_label: 'Release hold',
                })
              }
            >
              Release hold
            </button>
          ) : (
            <button
              type="button"
              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
              disabled={rowBusy}
              onClick={() =>
                openConfirm({
                  action: 'set_hold',
                  payout,
                  title: 'Put payout on hold',
                  message: 'This blocks payout completion until hold is released.',
                  confirm_label: 'Put on hold',
                })
              }
            >
              Hold
            </button>
          )
        ) : null}
      </div>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Payouts</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Payout operations</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Finance workflow, approvals, and reconciliation in one place.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/audit"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              View audit log
            </Link>
            <Link
              href="/admin"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Back to admin
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Total payouts', value: summary.total_count.toString() },
            { label: 'Total amount', value: formatCurrency(summary.total_amount) },
            { label: 'Scheduled', value: summary.scheduled_count.toString() },
            { label: 'On hold', value: summary.on_hold_count.toString() },
            { label: 'Failed', value: summary.failed_count.toString() },
          ].map((card) => (
            <div key={card.label} className="glass-card border border-[#191919] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#6b5f55]">{card.label}</p>
              <p className="mt-2 text-xl font-semibold text-[#191919]">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="glass-card border border-[#191919] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#191919]">Filters</h2>
                <p className="text-sm text-[#6b5f55]">Search by payout ID, coach, email, payment method, or status.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    setPage(1)
                    setAppliedFilters(filters)
                  }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    const cleared = { query: '', status: 'all', date_from: '', date_to: '' } as Filters
                    setFilters(cleared)
                    setAppliedFilters(cleared)
                    setPage(1)
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <input
                value={filters.query}
                onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                placeholder="Search payouts"
                className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919] md:col-span-2"
              />
              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as Filters['status'] }))}
                className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
              >
                <option value="all">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="on_hold">On hold</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(event) => setFilters((prev) => ({ ...prev, date_from: event.target.value }))}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(event) => setFilters((prev) => ({ ...prev, date_to: event.target.value }))}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
              </div>
            </div>
          </div>

          <div className="glass-card border border-[#191919] bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[#191919]">Reconciliation</h2>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                disabled={Boolean(actionLoadingId)}
                onClick={() =>
                  openConfirm({
                    action: 'reconcile',
                    title: 'Run reconciliation',
                    message: 'Recalculate payout mismatches and update reconciliation state.',
                    confirm_label: 'Run now',
                  })
                }
              >
                Run
              </button>
            </div>
            <p className="mt-2 text-sm text-[#6b5f55]">Last run: {formatDateTime(reconciliation.last_run_at || null)}</p>
            <p className="mt-1 text-sm text-[#6b5f55]">Stored mismatches: {reconciliation.mismatch_count}</p>
            <p className="mt-1 text-sm text-[#6b5f55]">Live mismatches: {reconciliation.live_mismatch_count ?? reconciliation.mismatch_count}</p>
            {Array.isArray(reconciliation.mismatch_sample_ids) && reconciliation.mismatch_sample_ids.length > 0 ? (
              <p className="mt-2 text-xs text-[#6b5f55]">Mismatch IDs: {reconciliation.mismatch_sample_ids.join(', ')}</p>
            ) : null}
          </div>
        </section>

        <section className="mt-6 glass-card border border-[#191919] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#191919]">Payouts</h2>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={loading || page <= 1}
              >
                Prev
              </button>
              <span className="font-semibold text-[#6b5f55]">Page {page} / {totalPages}</span>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={loading || !pagination.has_next}
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? <LoadingState label="Loading payouts..." /> : null}
            {!loading && payouts.length === 0 ? (
              <EmptyState title="No payouts found." description="Try another status filter or date window." />
            ) : null}
            {!loading
              ? payouts.map((payout) => (
                  <div key={payout.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{payout.coach}</p>
                        <p className="text-xs text-[#6b5f55]">{payout.coach_email || 'No email'} · {payout.id}</p>
                        <p className="text-xs text-[#6b5f55]">
                          Created {formatDate(payout.created_at)}
                          {payout.scheduled_for ? ` · Scheduled ${formatDate(payout.scheduled_for)}` : ''}
                          {payout.paid_at ? ` · Paid ${formatDate(payout.paid_at)}` : ''}
                        </p>
                        {payout.failure_reason ? (
                          <p className="mt-1 text-xs text-[#b80f0a]">Failure reason: {payout.failure_reason}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                          {formatCurrency(payout.amount)}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(payout.workflow_status)}`}>
                          {statusLabel(payout.workflow_status)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">{renderActions(payout)}</div>
                  </div>
                ))
              : null}
          </div>
        </section>
          </div>
        </div>
      </div>

      {detailsPayout ? (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Payout details</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">{detailsPayout.id}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailsPayout(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Status</p>
                <p className="mt-2 text-sm font-semibold text-[#191919]">{statusLabel(detailsPayout.workflow_status)}</p>
                <p className="mt-1">Base status: {detailsPayout.status || 'scheduled'}</p>
                {detailsPayout.failure_reason ? (
                  <p className="mt-1 text-[#b80f0a]">Failure reason: {detailsPayout.failure_reason}</p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Parties & payout method</p>
                <p className="mt-2">Coach: {detailsPayout.coach}</p>
                <p>Email: {detailsPayout.coach_email || 'Not listed'}</p>
                <p>Bank account: {detailsPayout.bank_last4 ? `•••• ${detailsPayout.bank_last4}` : 'Not listed'}</p>
                <p>Payment method: {detailsPayout.payment_method || 'Not listed'}</p>
                <p>Payment status: {detailsPayout.payment_status || 'Not listed'}</p>
              </div>

              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">References & timeline</p>
                <p className="mt-2">Payout reference: {detailsPayout.id}</p>
                <p>Session payment reference: {detailsPayout.session_payment_id || 'Not linked'}</p>
                <p>Created: {formatDateTime(detailsPayout.created_at)}</p>
                <p>Scheduled: {formatDateTime(detailsPayout.scheduled_for)}</p>
                <p>Paid: {formatDateTime(detailsPayout.paid_at)}</p>
                <p>Updated: {formatDateTime(detailsPayout.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-[710] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <h2 className="text-xl font-semibold text-[#191919]">{confirmAction.title}</h2>
            <p className="mt-2 text-sm text-[#6b5f55]">{confirmAction.message}</p>
            {confirmAction.require_note ? (
              <textarea
                value={confirmAction.note}
                onChange={(event) =>
                  setConfirmAction((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                }
                className="mt-4 h-24 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                placeholder="Required: add failure reason"
              />
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full border border-[#191919] bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                disabled={Boolean(actionLoadingId)}
                onClick={() => submitAction()}
              >
                {confirmAction.confirm_label}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
