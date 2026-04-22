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
  heard_from: string
  status: string
  created_at?: string | null
  verification_status: string
  verification_submitted_at?: string | null
  plan_tier: string
  stripe_connected: boolean
  bank_last4?: string | null
  athlete_count: number
  org_count: number
  org_names: string[]
  active_listings: number
  sessions: {
    total: number
    this_month: number
    last_session_at?: string | null
  }
  revenue: {
    session_gross: number
    marketplace_gross: number
    total_gross: number
  }
  messaging: {
    last_message_at?: string | null
  }
  marketplace: {
    sales_count: number
    last_sale_at?: string | null
  }
  reviews: {
    count: number
    average_rating: number
  }
  payouts: {
    total_count: number
    failed_count: number
    paid_count: number
    scheduled_count: number
    total_paid: number
    last_paid_at?: string | null
  }
}

type CoachDispute = {
  case_id: string
  coach_id: string
  amount: number
  status: string
}

type PayoutIssue = {
  coach_id: string
  issue: string
  action: string
}

export default function AdminCoachesPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [impersonationNotice, setImpersonationNotice] = useState('')
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [disputes, setDisputes] = useState<CoachDispute[]>([])
  const [payoutIssues, setPayoutIssues] = useState<PayoutIssue[]>([])

  const formatCurrency = (value: number | string | null | undefined) => {
    const amount = Number(value ?? 0)
    if (!Number.isFinite(amount)) return '$0'
    return `$${amount.toFixed(2).replace(/\.00$/, '')}`
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const formatRating = (value: number | null | undefined) => {
    const rating = Number(value ?? 0)
    if (!Number.isFinite(rating) || rating <= 0) return '—'
    return rating.toFixed(1)
  }

  useEffect(() => {
    let active = true
    const loadUsers = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/coaches')
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load coaches.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      const rows = (payload.coaches || []) as AdminUser[]
      setUsers(rows)
      setDisputes((payload.disputes || []) as CoachDispute[])
      setPayoutIssues((payload.payout_issues || []) as PayoutIssue[])
      setLoading(false)
    }
    loadUsers()
    return () => {
      active = false
    }
  }, [])

  const coaches = useMemo(
    () => users.filter((user) => ['coach', 'assistant_coach'].includes(user.role.toLowerCase())),
    [users],
  )

  const filteredCoaches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return coaches
    return coaches.filter((coach) =>
      [
        coach.name,
        coach.email,
        coach.plan_tier,
        coach.verification_status,
        coach.status,
        ...(coach.org_names || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [coaches, search])

  const activeCount = coaches.filter((user) => user.status.toLowerCase() !== 'suspended').length
  const suspendedCount = coaches.length - activeCount
  const stripeConnectedCount = coaches.filter((user) => user.stripe_connected).length
  const verifiedCount = coaches.filter((user) => user.verification_status === 'Approved').length
  const liveListingsCount = coaches.reduce((sum, coach) => sum + Number(coach.active_listings || 0), 0)

  useEffect(() => {
    if (!filteredCoaches.length) {
      setSelectedCoachId('')
      return
    }
    if (!selectedCoachId || !filteredCoaches.some((coach) => coach.id === selectedCoachId)) {
      setSelectedCoachId(filteredCoaches[0].id)
    }
  }, [filteredCoaches, selectedCoachId])

  const selectedCoach = filteredCoaches.find((coach) => coach.id === selectedCoachId) || filteredCoaches[0] || null
  const selectedCoachDisputes = disputes.filter((dispute) => dispute.coach_id === selectedCoach?.id).slice(0, 5)
  const selectedCoachPayoutIssues = payoutIssues.filter((issue) => issue.coach_id === selectedCoach?.id).slice(0, 5)

  const startImpersonation = async (userId: string) => {
    setImpersonationNotice('Starting impersonation...')
    const coach = users.find((row) => row.id === userId)
    const response = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: coach?.role || 'coach' }),
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
                { label: 'Stripe connected', value: stripeConnectedCount.toString() },
                { label: 'Verified', value: verifiedCount.toString() },
                { label: 'Live listings', value: liveListingsCount.toString() },
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
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedCoachId(coach.id)}
                      >
                        <p className="font-semibold text-[#191919]">{coach.name}</p>
                        <p className="text-xs text-[#6b5f55]">{coach.email}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#6b5f55]">
                          <span>{coach.plan_tier}</span>
                          <span>· {coach.verification_status}</span>
                          <span>· {coach.athlete_count} athletes</span>
                          <span>· {coach.sessions.this_month} sessions this month</span>
                          <span>· {coach.active_listings} active listings</span>
                          <span>· {coach.marketplace.sales_count} marketplace sales</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#6b5f55]">
                          Heard from: {coach.heard_from || 'Not captured'}
                        </p>
                        {coach.org_names.length > 0 ? (
                          <p className="mt-1 text-[11px] text-[#6b5f55]">
                            Org ties: {coach.org_names.join(', ')}
                          </p>
                        ) : null}
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          {coach.role === 'assistant_coach' ? 'Assistant coach' : 'Coach'}
                        </span>
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
                  <p className="mt-2 font-semibold text-[#191919]">{selectedCoach?.name || 'Select a coach'}</p>
                  <p className="text-xs text-[#6b5f55]">{selectedCoach?.email || '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Joined: {formatDateTime(selectedCoach?.created_at)}</p>
                  <p className="text-xs text-[#6b5f55]">Heard from: {selectedCoach?.heard_from || 'Not captured'}</p>
                  <p className="mt-2 text-xs text-[#6b5f55]">Verification: {selectedCoach?.verification_status || '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Submitted: {formatDateTime(selectedCoach?.verification_submitted_at)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Stripe & payouts</p>
                  <p className="mt-2 text-sm text-[#191919]">Stripe: {selectedCoach ? (selectedCoach.stripe_connected ? 'Connected' : 'Not connected') : '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Plan: {selectedCoach?.plan_tier || '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Bank: {selectedCoach?.bank_last4 ? `•••• ${selectedCoach.bank_last4}` : '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Failed payouts: {selectedCoach?.payouts.failed_count ?? 0}</p>
                  <p className="text-xs text-[#6b5f55]">Paid payouts: {selectedCoach?.payouts.paid_count ?? 0}</p>
                  <p className="text-xs text-[#6b5f55]">Scheduled payouts: {selectedCoach?.payouts.scheduled_count ?? 0}</p>
                  <p className="text-xs text-[#6b5f55]">Paid out total: {formatCurrency(selectedCoach?.payouts.total_paid)}</p>
                  <p className="text-xs text-[#6b5f55]">Last paid: {formatDateTime(selectedCoach?.payouts.last_paid_at)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Sessions & revenue</p>
                  <p className="mt-2 text-sm text-[#191919]">Monthly sessions: {selectedCoach?.sessions.this_month ?? '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Total sessions: {selectedCoach?.sessions.total ?? '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Last session: {formatDateTime(selectedCoach?.sessions.last_session_at)}</p>
                  <p className="text-xs text-[#6b5f55]">Session gross: {formatCurrency(selectedCoach?.revenue.session_gross)}</p>
                  <p className="text-xs text-[#6b5f55]">Marketplace gross: {formatCurrency(selectedCoach?.revenue.marketplace_gross)}</p>
                  <p className="text-xs text-[#6b5f55]">Total gross: {formatCurrency(selectedCoach?.revenue.total_gross)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Activity & orgs</p>
                  <p className="mt-2 text-sm text-[#191919]">Last message: {formatDateTime(selectedCoach?.messaging.last_message_at)}</p>
                  <p className="text-xs text-[#6b5f55]">Org memberships: {selectedCoach?.org_count ?? '—'}</p>
                  <p className="text-xs text-[#6b5f55]">
                    Org names: {selectedCoach?.org_names?.length ? selectedCoach.org_names.join(', ') : '—'}
                  </p>
                  <p className="text-xs text-[#6b5f55]">Active athletes: {selectedCoach?.athlete_count ?? '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Active listings: {selectedCoach?.active_listings ?? '—'}</p>
                  <p className="text-xs text-[#6b5f55]">Marketplace sales: {selectedCoach?.marketplace.sales_count ?? 0}</p>
                  <p className="text-xs text-[#6b5f55]">Last sale: {formatDateTime(selectedCoach?.marketplace.last_sale_at)}</p>
                  <p className="text-xs text-[#6b5f55]">
                    Reviews: {selectedCoach?.reviews.count ?? 0} ({formatRating(selectedCoach?.reviews.average_rating)})
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#6b5f55]">Select a coach from the list to review live account details.</p>
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
                  {selectedCoachDisputes.length === 0 ? (
                    <EmptyState title="No open disputes." description="This coach has no dispute or refund issues in the current admin feed." />
                  ) : (
                    selectedCoachDisputes.map((d) => (
                      <div key={d.case_id} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div>
                          <p className="font-semibold">{d.case_id}</p>
                          <p className="text-xs text-[#6b5f55]">{selectedCoach?.name || 'Coach'}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{d.status}</span>
                          <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{formatCurrency(d.amount)}</span>
                          <Link className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]" href="/admin/disputes">
                            Resolve
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
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
                  {selectedCoachPayoutIssues.length === 0 ? (
                    <EmptyState title="No payout issues." description="This coach has no current payout problems in the admin feed." />
                  ) : (
                    selectedCoachPayoutIssues.map((p) => (
                      <div key={p.coach_id + p.issue} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div>
                          <p className="font-semibold">{selectedCoach?.name || 'Coach'}</p>
                          <p className="text-xs text-[#6b5f55]">{p.issue}</p>
                        </div>
                        <Link
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                          href="/admin/payouts"
                        >
                          {p.action}
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
