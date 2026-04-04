'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type WaiverRow = {
  id: string
  org_id: string
  org_name: string
  org_type: string | null
  title: string
  required_roles: string[]
  is_active: boolean
  signature_count: number
  created_at: string
}

type OrgOption = { id: string; name: string }

const formatDate = (value: string) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminWaiversPage() {
  const [waivers, setWaivers] = useState<WaiverRow[]>([])
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(true)
  const [orgFilter, setOrgFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [flagged, setFlagged] = useState(false)

  const fetchWaivers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/waivers')
    if (res.ok) {
      const data = await res.json()
      setWaivers(data.waivers || [])
      setOrgs(data.orgs || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchWaivers() }, [fetchWaivers])

  const filtered = useMemo(() => {
    return waivers.filter((w) => {
      if (orgFilter !== 'all' && w.org_id !== orgFilter) return false
      if (statusFilter === 'active' && !w.is_active) return false
      if (statusFilter === 'inactive' && w.is_active) return false
      if (flagged && !(w.is_active && w.signature_count === 0)) return false
      return true
    })
  }, [waivers, orgFilter, statusFilter, flagged])

  const totalWaivers = waivers.length
  const totalActive = waivers.filter((w) => w.is_active).length
  const totalSigs = waivers.reduce((sum, w) => sum + w.signature_count, 0)
  const zeroSigActive = waivers.filter((w) => w.is_active && w.signature_count === 0).length

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Waivers</h1>
          <p className="mt-2 text-sm text-[#6b5f55]">
            All digital waivers across every organization, with signature counts and compliance gaps.
          </p>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">

            {/* Stats */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Total waivers', value: totalWaivers },
                { label: 'Active', value: totalActive },
                { label: 'Total signatures', value: totalSigs },
                { label: 'Active · 0 sigs', value: zeroSigActive, alert: zeroSigActive > 0 },
              ].map((stat) => (
                <article key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">{stat.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${stat.alert ? 'text-[#b80f0a]' : 'text-[#191919]'}`}>
                    {stat.value}
                  </p>
                </article>
              ))}
            </section>

            {/* Filters */}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={orgFilter}
                  onChange={(e) => setOrgFilter(e.target.value)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="all">All orgs</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-[#191919]">
                  <input
                    type="checkbox"
                    checked={flagged}
                    onChange={(e) => setFlagged(e.target.checked)}
                  />
                  Show compliance gaps only
                </label>
                <button
                  type="button"
                  onClick={fetchWaivers}
                  className="ml-auto rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading waivers…" />
                ) : filtered.length === 0 ? (
                  <EmptyState title="No waivers found." description="Adjust filters to see more." />
                ) : (
                  filtered.map((w) => {
                    const isGap = w.is_active && w.signature_count === 0
                    return (
                      <article
                        key={w.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          isGap ? 'border-[#b80f0a] bg-red-50' : 'border-[#dcdcdc] bg-[#f5f5f5]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#191919]">{w.title}</p>
                            <p className="mt-0.5 text-xs text-[#6b5f55]">
                              {w.org_name}
                              {w.org_type ? ` · ${w.org_type}` : ''}
                            </p>
                            <p className="mt-0.5 text-xs text-[#6b5f55]">
                              Required for: {(w.required_roles as string[]).join(', ')} ·{' '}
                              Created {formatDate(w.created_at)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                w.is_active
                                  ? 'bg-green-50 text-green-700'
                                  : 'border border-[#dcdcdc] text-[#6b5f55]'
                              }`}
                            >
                              {w.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                isGap
                                  ? 'border-[#b80f0a] text-[#b80f0a]'
                                  : 'border-[#191919] text-[#191919]'
                              }`}
                            >
                              {w.signature_count} sig{w.signature_count !== 1 ? 's' : ''}
                            </span>
                            {isGap && (
                              <span className="rounded-full bg-[#b80f0a] px-3 py-1 text-[11px] font-semibold text-white">
                                No signatures
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
