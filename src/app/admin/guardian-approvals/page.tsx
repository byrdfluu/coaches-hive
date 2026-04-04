'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'

type ApprovalRow = {
  id: string
  athlete_id: string
  athlete_name: string
  athlete_email?: string | null
  guardian_user_id?: string | null
  guardian_display_name?: string | null
  guardian_display_email?: string | null
  target_type: 'coach' | 'org' | 'team'
  target_id: string
  target_label?: string | null
  scope: 'messages' | 'transactions'
  status: 'pending' | 'approved' | 'denied' | 'expired'
  created_at: string
  responded_at?: string | null
  expires_at?: string | null
}

type ApprovalSummary = {
  total: number
  pending: number
  approved: number
  denied: number
  expired: number
  messages: number
  transactions: number
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AdminGuardianApprovalsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [summary, setSummary] = useState<ApprovalSummary | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'denied' | 'expired'>('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'messages' | 'transactions'>('all')
  const [targetTypeFilter, setTargetTypeFilter] = useState<'all' | 'coach' | 'org' | 'team'>('all')

  const fetchApprovals = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (scopeFilter !== 'all') params.set('scope', scopeFilter)
    if (targetTypeFilter !== 'all') params.set('target_type', targetTypeFilter)
    if (query.trim()) params.set('query', query.trim())
    params.set('limit', '300')

    const response = await fetch(`/api/admin/guardian-approvals?${params.toString()}`)
    if (!response.ok) {
      setRows([])
      setSummary(null)
      setCanManage(false)
      setLoading(false)
      return
    }

    const payload = await response.json().catch(() => null)
    setRows((payload?.approvals || []) as ApprovalRow[])
    setSummary((payload?.summary || null) as ApprovalSummary | null)
    setCanManage(Boolean(payload?.permissions?.can_manage))
    setLoading(false)
  }, [query, scopeFilter, statusFilter, targetTypeFilter])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  const runAction = async (approvalId: string, action: 'approve' | 'deny' | 'expire' | 'resend') => {
    if (!canManage) {
      setToast('You do not have permission to change guardian approvals.')
      return
    }
    const reason = window.prompt('Optional reason for audit log:') || ''
    setSaving(true)
    const response = await fetch('/api/admin/guardian-approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approval_id: approvalId, action, reason }),
    })
    setSaving(false)

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Unable to run guardian approval action.')
      return
    }

    setToast(
      action === 'approve'
        ? 'Approval granted.'
        : action === 'deny'
          ? 'Approval denied.'
          : action === 'expire'
            ? 'Approval expired.'
            : 'Reminder sent.',
    )
    await fetchApprovals()
  }

  const sortedRows = useMemo(
    () => rows.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows],
  )

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Guardian approvals</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Review, approve, deny, resend, or expire guardian approval requests.
            </p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Total</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.total || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Pending</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.pending || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Messages</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.messages || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Transactions</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.transactions || 0}</p>
              </article>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search athlete, guardian, target"
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                  <option value="expired">Expired</option>
                </select>
                <select
                  value={scopeFilter}
                  onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="all">All scopes</option>
                  <option value="messages">Messages</option>
                  <option value="transactions">Transactions</option>
                </select>
                <select
                  value={targetTypeFilter}
                  onChange={(event) => setTargetTypeFilter(event.target.value as typeof targetTypeFilter)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="all">All targets</option>
                  <option value="coach">Coach</option>
                  <option value="org">Organization</option>
                  <option value="team">Team</option>
                </select>
                <button
                  type="button"
                  onClick={fetchApprovals}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {!loading && !canManage ? (
                  <p className="text-xs text-[#6b5f55]">Read-only access. You can review approvals but not change them.</p>
                ) : null}
                {loading ? (
                  <LoadingState label="Loading guardian approvals..." />
                ) : sortedRows.length === 0 ? (
                  <EmptyState
                    title="No guardian approvals found."
                    description="Approvals appear after a minor athlete requests coach messaging or booking/payment access that requires guardian approval."
                  />
                ) : (
                  sortedRows.map((row) => (
                    <article key={row.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{row.athlete_name}</p>
                          <p className="text-xs text-[#6b5f55]">
                            {row.athlete_email || 'No athlete email'} · Guardian {row.guardian_display_name || '—'}
                          </p>
                          <p className="text-xs text-[#6b5f55]">Guardian email: {row.guardian_display_email || '—'}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">
                            {row.scope.toUpperCase()} · {row.target_type.toUpperCase()} · {row.target_label || 'No label'}
                          </p>
                          <p className="text-[11px] text-[#6b5f55]">
                            Created {formatDateTime(row.created_at)} · Responded {formatDateTime(row.responded_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919]">
                            {row.status}
                          </span>
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                onClick={() => runAction(row.id, 'resend')}
                                disabled={saving}
                                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                              >
                                Resend
                              </button>
                              {row.status === 'pending' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => runAction(row.id, 'approve')}
                                    disabled={saving}
                                    className="rounded-full bg-[#191919] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => runAction(row.id, 'deny')}
                                    disabled={saving}
                                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                                  >
                                    Deny
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => runAction(row.id, 'expire')}
                                    disabled={saving}
                                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                                  >
                                    Expire
                                  </button>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))
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
