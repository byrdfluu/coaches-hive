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
  duplicate_paid_registration: 'Duplicate paid registration',
}

const IssueChip = ({ issue }: { issue: string }) => (
  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-[#b80f0a]">
    {ISSUE_LABELS[issue] || issue}
  </span>
)

const StatusChip = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    active: 'bg-green-50 text-green-800',
    draft: 'bg-neutral-100 text-neutral-600',
    closed: 'bg-red-50 text-[#b80f0a]',
    archived: 'bg-neutral-200 text-neutral-500',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${colors[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {status || '—'}
    </span>
  )
}

export default function AdminProgramsPage() {
  const [data, setData] = useState<any>({ programs: [], summary: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showTest, setShowTest] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter) params.set('type', typeFilter)
    if (showTest) params.set('show_test_data', 'true')
    const res = await fetch(`/api/admin/programs?${params.toString()}`, { cache: 'no-store' })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) setError(payload.error || 'Failed to load programs.')
    else setData(payload)
    setLoading(false)
  }, [statusFilter, typeFilter, showTest])

  useEffect(() => { void load() }, [load])

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const programs: any[] = data.programs || []
  const summary = data.summary || {}

  const filtered = programs.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.org_name || '').toLowerCase().includes(q) ||
      (p.type || '').toLowerCase().includes(q)
    )
  })

  const csvUrl = `/api/admin/programs?format=csv${statusFilter ? `&status=${statusFilter}` : ''}${typeFilter ? `&type=${typeFilter}` : ''}${showTest ? '&show_test_data=true' : ''}`

  return (
    <main className="page-shell">
      <div className="relative z-10 px-6 py-10">
        <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <AdminSidebar />
          <div className="min-w-0 space-y-6">

            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Operations</p>
                <h1 className="text-3xl font-bold">Programs</h1>
                <p className="mt-1 text-sm text-neutral-600">
                  Camps, leagues, and clinics. Inspect registrations, financials, targeting, and Stripe IDs. Read-only — Stripe and webhooks remain authoritative.
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
                { label: 'Active', value: summary.active ?? '—' },
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
                placeholder="Search by name, org, or type…"
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
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="rounded-2xl border border-[#d8d8d8] bg-white px-4 py-2 text-sm outline-none focus:border-[#191919]"
              >
                <option value="">All types</option>
                <option value="camp">Camp</option>
                <option value="league">League</option>
                <option value="clinic">Clinic</option>
                <option value="program">Program</option>
              </select>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} />
                Show test data
              </label>
            </div>

            {error && <p className="rounded-2xl border bg-red-50 p-3 text-sm text-[#b80f0a]">{error}</p>}

            {loading ? (
              <p className="text-sm text-neutral-500">Loading programs…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-neutral-500">No programs found.</p>
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-[#d8d8d8] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#d8d8d8] text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3">Program</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Targeting</th>
                      <th className="px-4 py-3 text-right">Capacity</th>
                      <th className="px-4 py-3 text-right">Paid / Total</th>
                      <th className="px-4 py-3 text-right">Gross</th>
                      <th className="px-4 py-3 text-right">Platform fee</th>
                      <th className="px-4 py-3 text-right">Org net</th>
                      <th className="px-4 py-3">Issues</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p: any) => (
                      <>
                        <tr
                          key={p.id}
                          className="border-b border-[#f0f0f0] hover:bg-neutral-50 cursor-pointer"
                          onClick={() => toggleExpanded(p.id)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold">{p.name}</p>
                            <p className="text-xs text-neutral-500">{p.org_name}</p>
                          </td>
                          <td className="px-4 py-3 capitalize text-neutral-600">{p.type || '—'}</td>
                          <td className="px-4 py-3"><StatusChip status={p.status || ''} /></td>
                          <td className="px-4 py-3 text-xs text-neutral-600 capitalize">{(p.target_audience || '').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-right text-neutral-700">
                            {p.capacity ? `${p.registrations.remaining_spots ?? '∞'} left / ${p.capacity}` : '∞'}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-700">
                            {p.registrations.paid} / {p.registrations.total}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(p.financials.gross_cents)}</td>
                          <td className="px-4 py-3 text-right text-neutral-600">{fmt(p.financials.platform_fee_cents)}</td>
                          <td className="px-4 py-3 text-right text-neutral-600">{fmt(p.financials.net_cents)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {p.issues.length === 0
                                ? <span className="text-xs text-neutral-400">—</span>
                                : p.issues.map((issue: string) => <IssueChip key={issue} issue={issue} />)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-400">{expanded.has(p.id) ? '▲' : '▼'}</td>
                        </tr>
                        {expanded.has(p.id) && (
                          <tr key={`${p.id}-detail`} className="border-b border-[#f0f0f0] bg-neutral-50">
                            <td colSpan={11} className="px-6 py-4">
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Registration breakdown</p>
                                  <dl className="space-y-1 text-sm">
                                    {Object.entries(p.registrations).filter(([k]) => k !== 'remaining_spots').map(([k, v]) => (
                                      <div key={k} className="flex justify-between">
                                        <dt className="capitalize text-neutral-500">{k.replace(/_/g, ' ')}</dt>
                                        <dd className="font-semibold">{String(v)}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Financials</p>
                                  <dl className="space-y-1 text-sm">
                                    <div className="flex justify-between"><dt className="text-neutral-500">Gross</dt><dd className="font-semibold">{fmt(p.financials.gross_cents)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-neutral-500">Platform fee</dt><dd>{fmt(p.financials.platform_fee_cents)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-neutral-500">Org net</dt><dd>{fmt(p.financials.net_cents)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-neutral-500">Price per seat</dt><dd>{p.price != null ? `$${Number(p.price).toFixed(2)}` : '—'}</dd></div>
                                  </dl>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Stripe IDs</p>
                                  <div className="space-y-1">
                                    {p.stripe.checkout_session_ids.length === 0 && p.stripe.payment_intent_ids.length === 0
                                      ? <p className="text-xs text-neutral-400">No Stripe records found</p>
                                      : null}
                                    {p.stripe.payment_intent_ids.map((id: string) => (
                                      <p key={id} className="truncate font-mono text-xs text-neutral-600">{id}</p>
                                    ))}
                                    {p.stripe.checkout_session_ids.map((id: string) => (
                                      <p key={id} className="truncate font-mono text-xs text-neutral-400">{id}</p>
                                    ))}
                                  </div>
                                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1">Targeting</p>
                                  <p className="text-xs text-neutral-600 capitalize">{(p.target_audience || '').replace(/_/g, ' ')} · {p.target_count} rule{p.target_count !== 1 ? 's' : ''}</p>
                                  <p className="mt-2 text-xs text-neutral-400">Workspace: {p.workspace_id || '—'}</p>
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
                  {filtered.length} of {programs.length} programs · Superadmin read-only · Stripe authoritative
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
