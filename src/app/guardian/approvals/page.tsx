'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import GuardianSidebar from '@/components/GuardianSidebar'

type Approval = {
  id: string
  athlete_id: string
  scope: string
  target_type?: string | null
  target_label?: string | null
  expires_at?: string | null
  status: string
  created_at: string
}

type LinkedAthlete = {
  id: string
  athlete_id: string
  related_profile?: {
    full_name?: string | null
    email?: string | null
  } | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  approved: 'bg-green-50 text-green-700',
  denied: 'bg-red-50 text-[#b80f0a]',
  expired: 'bg-[#f5f5f5] text-[#9a9a9a]',
}

export default function GuardianApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [athletes, setAthletes] = useState<LinkedAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const searchParams = useSearchParams()
  const [filterAthlete, setFilterAthlete] = useState(() => searchParams?.get('athlete') || '')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterScope, setFilterScope] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [approvalsRes, linksRes] = await Promise.all([
        fetch('/api/guardian-approvals'),
        fetch('/api/guardian-links'),
      ])
      if (approvalsRes.ok) {
        const data = await approvalsRes.json()
        setApprovals(data.approvals || [])
      }
      if (linksRes.ok) {
        const data = await linksRes.json()
        setAthletes(data.links || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const athleteMap = useMemo(() => {
    const m = new Map<string, string>()
    athletes.forEach((a) => {
      m.set(a.athlete_id, a.related_profile?.full_name || a.related_profile?.email || 'Athlete')
    })
    return m
  }, [athletes])

  const allScopes = useMemo(() => {
    return Array.from(new Set(approvals.map((a) => a.scope).filter(Boolean)))
  }, [approvals])

  const filtered = useMemo(() => {
    return approvals.filter((a) => {
      if (filterAthlete && a.athlete_id !== filterAthlete) return false
      if (filterStatus && a.status !== filterStatus) return false
      if (filterScope && a.scope !== filterScope) return false
      return true
    })
  }, [approvals, filterAthlete, filterStatus, filterScope])

  const handleDecision = async (approvalId: string, action: 'approve' | 'deny') => {
    if (actingId) return
    setActingId(approvalId)
    setActionError('')
    const res = await fetch('/api/guardian-approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approval_id: approvalId, action }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setActionError(data?.error || 'Unable to process decision.')
    } else {
      setApprovals((prev) =>
        prev.map((a) => (a.id === approvalId ? { ...a, status: action === 'approve' ? 'approved' : 'denied' } : a)),
      )
    }
    setActingId(null)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="guardian" />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Guardian</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Approvals</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">Full history of approval requests from your linked athletes.</p>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <GuardianSidebar />
          <div className="space-y-6">
            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">Loading…</div>
            ) : (
              <section className="glass-card border border-[#191919] bg-white p-6">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-5">
                  <select
                    value={filterAthlete}
                    onChange={(e) => setFilterAthlete(e.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                  >
                    <option value="">All athletes</option>
                    {athletes.map((a) => (
                      <option key={a.athlete_id} value={a.athlete_id}>
                        {a.related_profile?.full_name || a.related_profile?.email || a.athlete_id}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                  >
                    <option value="">All statuses</option>
                    {Object.keys(STATUS_LABELS).map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  {allScopes.length > 0 && (
                    <select
                      value={filterScope}
                      onChange={(e) => setFilterScope(e.target.value)}
                      className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    >
                      <option value="">All scopes</option>
                      {allScopes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>

                {actionError && <p className="mb-3 text-xs text-[#b80f0a]">{actionError}</p>}

                {filtered.length === 0 ? (
                  <p className="text-sm text-[#4a4a4a]">No approvals match your filters.</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {filtered.map((approval) => {
                      const athleteName = athleteMap.get(approval.athlete_id) || 'Athlete'
                      const expiresAt = approval.expires_at ? new Date(approval.expires_at) : null
                      const isExpired = expiresAt ? expiresAt < new Date() : false
                      const displayStatus = isExpired && approval.status === 'pending' ? 'expired' : approval.status
                      return (
                        <div
                          key={approval.id}
                          className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[#191919]">
                                {approval.target_label || approval.scope}
                              </p>
                              <p className="mt-0.5 text-xs text-[#4a4a4a]">
                                {athleteName} &middot; {approval.scope}
                                {approval.target_type ? ` · ${approval.target_type}` : ''}
                              </p>
                              <p className="mt-0.5 text-xs text-[#4a4a4a]">
                                {new Date(approval.created_at).toLocaleDateString()}
                                {expiresAt && !isExpired
                                  ? ` · Expires ${expiresAt.toLocaleDateString()}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[displayStatus] || 'bg-[#f5f5f5] text-[#4a4a4a]'}`}>
                                {STATUS_LABELS[displayStatus] || displayStatus}
                              </span>
                              {approval.status === 'pending' && !isExpired && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDecision(approval.id, 'approve')}
                                    disabled={actingId === approval.id}
                                    className="rounded-full bg-[#191919] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-80 disabled:opacity-50 transition-opacity"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDecision(approval.id, 'deny')}
                                    disabled={actingId === approval.id}
                                    className="rounded-full border border-[#b80f0a] px-3 py-1.5 text-xs font-semibold text-[#b80f0a] hover:bg-[#b80f0a] hover:text-white disabled:opacity-50 transition-colors"
                                  >
                                    Deny
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
