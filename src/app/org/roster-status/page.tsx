'use client'

import { useEffect, useMemo, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'

type Enrollment = {
  id: string
  athlete_id: string
  athlete_name: string
  guardian_user_id: string | null
  team_id: string | null
  team_name: string | null
  season: string | null
  status: 'enrolled' | 'waitlisted' | 'withdrawn' | 'graduated'
  enrolled_at: string | null
}

const STATUS_LABEL: Record<Enrollment['status'], string> = {
  enrolled: 'Enrolled',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
}

const STATUS_COLOR: Record<Enrollment['status'], string> = {
  enrolled: 'text-green-700',
  waitlisted: 'text-amber-700',
  withdrawn: 'text-[#b80f0a]',
  graduated: 'text-[#4a4a4a]',
}

const formatDate = (value: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString()
}

export default function OrgRosterStatusPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Enrollment['status']>('all')
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    const response = await fetch('/api/org/roster-status', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) {
      setError(payload?.error || 'Unable to load roster status.')
      setLoading(false)
      return
    }
    setEnrollments(payload.enrollments || [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(
    () => (filter === 'all' ? enrollments : enrollments.filter((row) => row.status === filter)),
    [enrollments, filter],
  )

  const setStatus = async (id: string, status: Enrollment['status']) => {
    setSavingId(id)
    const response = await fetch('/api/org/roster-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (response.ok) {
      setEnrollments((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))
    } else {
      const payload = await response.json().catch(() => null)
      setError(payload?.error || 'Unable to update status.')
    }
    setSavingId(null)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Roster Status</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Season enrollment status for each athlete on your roster. This is shared with the organization mobile app.
            </p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <div className="lg:hidden"><OrgSidebar /></div>
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'enrolled', 'waitlisted', 'withdrawn', 'graduated'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                      filter === value
                        ? 'border-[#191919] bg-[#191919] text-white'
                        : 'border-[#dcdcdc] text-[#4a4a4a] hover:border-[#191919]'
                    }`}
                  >
                    {value === 'all' ? 'All' : STATUS_LABEL[value]}
                  </button>
                ))}
              </div>

              {error && <p className="mt-4 text-sm text-[#b80f0a]">{error}</p>}

              <div className="mt-4 space-y-2">
                {loading ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                    Loading roster status…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                    No athletes match this filter.
                  </div>
                ) : (
                  filtered.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-[#191919]">{row.athlete_name}</p>
                        <p className="mt-0.5 text-xs text-[#4a4a4a]">
                          {[row.team_name, row.season, formatDate(row.enrolled_at)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${STATUS_COLOR[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                        <select
                          value={row.status}
                          disabled={savingId === row.id}
                          onChange={(event) => void setStatus(row.id, event.target.value as Enrollment['status'])}
                          className="rounded-xl border border-[#dcdcdc] bg-white px-2 py-1 text-xs disabled:opacity-50"
                        >
                          {(['enrolled', 'waitlisted', 'withdrawn', 'graduated'] as const).map((status) => (
                            <option key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
