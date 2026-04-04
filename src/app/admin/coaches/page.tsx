'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type AdminUser = {
  id: string
  name: string
  role: string
  email: string
  status: string
}

const disputes: Array<{ caseId: string; coach: string; amount: string; status: string }> = []

const payoutIssues: Array<{ coach: string; issue: string; action: string }> = []

export default function AdminCoachesPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [impersonationNotice, setImpersonationNotice] = useState('')

  useEffect(() => {
    let active = true
    const loadUsers = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/users')
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load coaches.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      const rows = (payload.users || []).map((user: { id: string; email: string; role: string; status: string; full_name: string }) => ({
        id: user.id,
        name: user.full_name || user.email || 'User',
        role: user.role || 'unknown',
        email: user.email,
        status: user.status || 'Active',
      }))
      setUsers(rows)
      setLoading(false)
    }
    loadUsers()
    return () => {
      active = false
    }
  }, [])

  const coaches = useMemo(
    () => users.filter((user) => user.role.toLowerCase() === 'coach'),
    [users]
  )

  const filteredCoaches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return coaches
    return coaches.filter((coach) =>
      coach.name.toLowerCase().includes(term) ||
      coach.email.toLowerCase().includes(term)
    )
  }, [coaches, search])

  const activeCount = coaches.filter((user) => user.status.toLowerCase() !== 'suspended').length
  const suspendedCount = coaches.length - activeCount
  const primaryCoach = filteredCoaches[0]

  const startImpersonation = async (userId: string) => {
    setImpersonationNotice('Starting impersonation...')
    const response = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: 'coach' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setImpersonationNotice(payload.error || 'Unable to impersonate.')
      return
    }
    setImpersonationNotice(`Impersonating coach (${userId}).`)
  }

  const clearImpersonation = async () => {
    setImpersonationNotice('Stopping impersonation...')
    const response = await fetch('/api/admin/impersonate/clear', { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setImpersonationNotice(payload.error || 'Unable to clear impersonation.')
      return
    }
    setImpersonationNotice('Impersonation cleared.')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Coaches</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Monitor coach accounts, status, and activity.</p>
          </div>
          <button
            className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
            onClick={() => clearImpersonation()}
          >
            Stop impersonating
          </button>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Total coaches', value: coaches.length.toString() },
                { label: 'Active', value: activeCount.toString() },
                { label: 'Suspended', value: suspendedCount.toString() },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#191919]">Coach accounts</h2>
              </div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-[1fr_auto]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Search by name or email"
                />
              </div>
              {impersonationNotice ? (
                <p className="mt-3 text-xs text-[#6b5f55]">{impersonationNotice}</p>
              ) : null}
              {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading coaches..." />
                ) : filteredCoaches.length === 0 ? (
                  <EmptyState title="No coaches found." description="Try adjusting your search terms." />
                ) : (
                  filteredCoaches.map((coach) => (
                    <div key={coach.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{coach.name}</p>
                        <p className="text-xs text-[#6b5f55]">{coach.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          {coach.status}
                        </span>
                        <button
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                          onClick={() => startImpersonation(coach.id)}
                        >
                          Impersonate
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Coach visibility</h2>
              <p className="mt-2 text-sm text-[#6b5f55]">
                Admins can review coach profile, payouts, activity, and org ties.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Profile & verification</p>
                  <p className="mt-2 font-semibold text-[#191919]">{primaryCoach?.name || 'Select a coach'}</p>
                  <p className="text-xs text-[#6b5f55]">{primaryCoach?.email || '—'}</p>
                  <p className="mt-2 text-xs text-[#6b5f55]">Verification: Pending review</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Stripe & payouts</p>
                  <p className="mt-2 text-sm text-[#191919]">Stripe: Not connected</p>
                  <p className="text-xs text-[#6b5f55]">Payout cadence: Weekly</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Sessions & revenue</p>
                  <p className="mt-2 text-sm text-[#191919]">Monthly sessions: —</p>
                  <p className="text-xs text-[#6b5f55]">Revenue: —</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Messages & orgs</p>
                  <p className="mt-2 text-sm text-[#191919]">Last message: —</p>
                  <p className="text-xs text-[#6b5f55]">Org memberships: —</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#6b5f55]">Select a coach to see details.</p>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#191919]">Disputes & refunds</h2>
                  <Link className="text-sm font-semibold text-[#191919] underline" href="/admin/disputes">
                    Open queue
                  </Link>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[#191919]">
                  {disputes.map((d) => (
                    <div key={d.caseId} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div>
                        <p className="font-semibold">{d.caseId}</p>
                        <p className="text-xs text-[#6b5f55]">{d.coach}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{d.status}</span>
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{d.amount}</span>
                        <Link className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]" href="/admin/disputes">
                          Resolve
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#191919]">Payout issues</h2>
                  <Link className="text-sm font-semibold text-[#191919] underline" href="/admin/payouts">
                    View payouts
                  </Link>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[#191919]">
                  {payoutIssues.map((p) => (
                    <div key={p.coach + p.issue} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div>
                        <p className="font-semibold">{p.coach}</p>
                        <p className="text-xs text-[#6b5f55]">{p.issue}</p>
                      </div>
                      <Link
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                        href="/admin/payouts"
                      >
                        {p.action}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
