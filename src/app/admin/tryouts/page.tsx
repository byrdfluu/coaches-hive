'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'

const fmt = (cents: number) =>
  cents === 0 ? '$0.00' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const ISSUE_LABELS: Record<string, string> = {
  over_capacity: 'Over capacity',
  closed_with_pending_checkout: 'Closed, pending checkout',
  expired_pending_checkout: 'Expired pending checkout',
  missing_platform_fee: 'Missing platform fee',
  paid_checkout_pending_registration: 'Paid checkout, pending reg',
  paid_registration_no_payment_intent: 'Paid, no PaymentIntent',
  duplicate_paid_registration: 'Duplicate paid registration',
}

const IssueChip = ({ issue }: { issue: string }) => (
  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-[#b80f0a]">
    {ISSUE_LABELS[issue] || issue}
  </span>
)

const StatusChip = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    open: 'bg-green-50 text-green-800',
    closed: 'bg-red-50 text-[#b80f0a]',
    canceled: 'bg-neutral-100 text-neutral-600',
    draft: 'bg-neutral-100 text-neutral-600',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${colors[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {status || '—'}
    </span>
  )
}

export default function AdminTryoutsPage() {
  const [data, setData] = useState<any>({ tryouts: [], summary: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showTest, setShowTest] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (showTest) params.set('show_test_data', 'true')
    const res = await fetch(`/api/admin/tryouts?${params.toString()}`, { cache: 'no-store' })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) setError(payload.error || 'Failed to load tryouts.')
    else setData(payload)
    setLoading(false)
  }, [statusFilter, showTest])

  useEffect(() => { void load() }, [load])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tryouts: any[] = data.tryouts || []
  const summary = data.summary || {}

  const filtered = tryouts.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (t.title || '').toLowerCase().includes(q) || (t.org_name || '').toLowerCase().includes(q)
  })

  const csvUrl = `/api/admin/tryouts?format=csv${statusFilter ? `&status=${statusFilter}` : ''}${showTest ? '&show_test_data=true' : ''}`

  return (
    <main className="page-shell">
      <div className="relative z-10 px-6 py-10">
        <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <AdminSidebar />
          <div className="min-w-0 space-y-6">

            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Operations</p>
                <h1 className="text-3xl font-bold">Tryouts</h1>
                <p className="mt-1 text-sm text-neutral-600">
                  Org tryout registrations, payments, capacity, and Connect readiness. Read-only — Stripe and webhooks remain authoritative.
                </p>
              </div>
              <a href={csvUrl} download className="rounded-full border border-[#d8d8d8] bg-white px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-neutral-50">
                Export CSV
              </a>
            </header>

            {/* Summary tiles */}
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Total', value: summary.total ?? '—' },
                { label: 'Open', value: summary.open ?? '—' },
                { label: 'With issues', value: summary.with_issues ?? '—', red: (summary.with_issues || 0) > 0 },
                { label: 'Gross collected', value: fmt(summary.total_gross_cents || 0) },
                { label: 'Platform fees', value: fmt(summary.total_platform_fee_cents || 0) },
                { label: 'Org net', value: fmt(summary.total_net_cents || 0) },
              ].map(tile => (
                <div key={tile.label} className="rounded-3xl border border-[#d8d8d8] bg-white p-4">
                  <p className="text-xs text-neutral-500">{tile.label}</p>
                  <p className={`mt-1 text-xl font-bold ${tile.red ? 'text-[#b80f0a]' : ''}`}>{tile.value}</p>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                placeholder="Search by title or org…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="rounded-2xl border border-[#d8d8d8] bg-white px-4 py-2 text-sm outline-none focus:border-[#191919]"
                style={{ minWidth: 220 }}
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-2xl border border-[#d8d8d8] bg-white px-4 py-2 text-sm outline-none focus:border-[#191919]"
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="canceled">Canceled</option>
                <option value="draft">Draft</option>
              </select>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} />
                Show test data
              </label>
            </div>

            {error && <p className="rounded-2xl border bg-red-50 p-3 text-sm text-[#b80f0a]">{error}</p>}

            {loading ? (
              <p className="text-sm text-neutral-500">Loading tryouts…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-neutral-500">No tryouts found.</p>
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-[#d8d8d8] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#d8d8d8] text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3">Tryout</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Capacity</th>
                      <th className="px-4 py-3 text-right">Paid / Pending / Total</th>
                      <th className="px-4 py-3 text-right">Gross</th>
                      <th className="px-4 py-3 text-right">Platform fee</th>
                      <th className="px-4 py-3 text-right">Org net</th>
                      <th className="px-4 py-3">Issues</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t: any) => (
                      <>
                        <tr
                          key={t.id}
                          className="border-b border-[#f0f0f0] hover:bg-neutral-50 cursor-pointer"
                          onClick={() => toggleExpanded(t.id)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold">{t.title}</p>
                            <p className="text-xs text-neutral-500">{t.org_name}</p>
                          </td>
                          <td className="px-4 py-3"><StatusChip status={t.status || ''} /></td>
                          <td className="px-4 py-3 text-right">{t.price != null ? `$${Number(t.price).toFixed(2)}` : '—'}</td>
                          <td className="px-4 py-3 text-right text-neutral-700">
                            {t.max_participants
                              ? `${t.registrations.remaining_spots ?? '∞'} left / ${t.max_participants}`
                              : '∞'}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-700">
                            {t.registrations.paid} / {t.registrations.pending} / {t.registrations.total}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(t.financials.gross_cents)}</td>
                          <td className="px-4 py-3 text-right text-neutral-600">{fmt(t.financials.platform_fee_cents)}</td>
                          <td className="px-4 py-3 text-right text-neutral-600">{fmt(t.financials.net_cents)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {t.issues.length === 0
                                ? <span className="text-xs text-neutral-400">—</span>
                                : t.issues.map((issue: string) => <IssueChip key={issue} issue={issue} />)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-400">{expanded.has(t.id) ? '▲' : '▼'}</td>
                        </tr>
                        {expanded.has(t.id) && (
                          <tr key={`${t.id}-detail`} className="border-b border-[#f0f0f0] bg-neutral-50">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Registration breakdown</p>
                                  <dl className="space-y-1 text-sm">
                                    {['paid', 'pending', 'waitlisted', 'canceled', 'expired', 'refunded', 'total'].map(k => (
                                      <div key={k} className="flex justify-between">
                                        <dt className="capitalize text-neutral-500">{k}</dt>
                                        <dd className="font-semibold">{t.registrations[k] ?? '—'}</dd>
                                      </div>
                                    ))}
                                    {t.registrations.remaining_spots !== null && (
                                      <div className="flex justify-between">
                                        <dt className="text-neutral-500">Remaining spots</dt>
                                        <dd className="font-semibold">{t.registrations.remaining_spots}</dd>
                                      </div>
                                    )}
                                  </dl>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Financials</p>
                                  <dl className="space-y-1 text-sm">
                                    <div className="flex justify-between"><dt className="text-neutral-500">Gross</dt><dd className="font-semibold">{fmt(t.financials.gross_cents)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-neutral-500">Platform fee (7%)</dt><dd>{fmt(t.financials.platform_fee_cents)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-neutral-500">Org net</dt><dd>{fmt(t.financials.net_cents)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-neutral-500">Price per spot</dt><dd>{t.price != null ? `$${Number(t.price).toFixed(2)}` : '—'}</dd></div>
                                  </dl>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Stripe IDs</p>
                                  <div className="space-y-1">
                                    {t.stripe.checkout_session_ids.length === 0 && t.stripe.payment_intent_ids.length === 0
                                      ? <p className="text-xs text-neutral-400">No Stripe records found</p>
                                      : null}
                                    {t.stripe.payment_intent_ids.map((id: string) => (
                                      <p key={id} className="truncate font-mono text-xs text-neutral-600">{id}</p>
                                    ))}
                                    {t.stripe.checkout_session_ids.map((id: string) => (
                                      <p key={id} className="truncate font-mono text-xs text-neutral-400">{id}</p>
                                    ))}
                                  </div>
                                  <p className="mt-3 text-xs text-neutral-400">Tryout ID: {t.id}</p>
                                  <p className="text-xs text-neutral-400">Org ID: {t.org_id}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-[#f0f0f0] px-4 py-3 text-xs text-neutral-400">
                  {filtered.length} of {tryouts.length} tryouts · Superadmin read-only · Stripe authoritative
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
