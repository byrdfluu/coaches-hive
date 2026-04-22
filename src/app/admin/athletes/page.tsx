'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type AthleteGuardianLink = {
  id: string
  guardian_user_id: string
  name?: string | null
  email?: string | null
  relationship?: string | null
  status: string
  updated_at?: string | null
}

type AthleteGuardianData = {
  profile_name?: string | null
  profile_email?: string | null
  profile_phone?: string | null
  linked_guardians: AthleteGuardianLink[]
}

type AthleteApprovalsData = {
  pending: number
  approved: number
  denied: number
  expired: number
  last_status?: string | null
  last_scope?: string | null
  last_target_type?: string | null
  last_target_label?: string | null
  last_created_at?: string | null
}

type AthletePaymentsData = {
  lifetime_spend: number
  last_payment_at?: string | null
}

type AthleteSessionsData = {
  this_month: number
  total: number
  attendance_rate: number
}

type AthleteMessagingData = {
  last_message_at?: string | null
}

type AthleteMembershipsData = {
  org_count: number
  team_count: number
}

type AthleteSubProfile = {
  id: string
  name: string
  sport?: string | null
  grade_level?: string | null
  season?: string | null
  birthdate?: string | null
  location?: string | null
  created_at?: string | null
  sessions: AthleteSessionsData
  notes: {
    total: number
    last_note_at?: string | null
  }
  orders: {
    total: number
    lifetime_spend: number
    last_order_at?: string | null
  }
  last_activity_at?: string | null
}

type AthleteProfilesData = {
  total: number
  linked_sub_profiles: AthleteSubProfile[]
}

type AdminAthlete = {
  id: string
  name: string
  email: string
  heard_from: string
  status: string
  guardian: AthleteGuardianData
  approvals: AthleteApprovalsData
  payments: AthletePaymentsData
  sessions: AthleteSessionsData
  messaging: AthleteMessagingData
  memberships: AthleteMembershipsData
  athlete_profiles: AthleteProfilesData
}

type AdminAthletesResponse = {
  athletes: AdminAthlete[]
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0)

export default function AdminAthletesPage() {
  const [athletes, setAthletes] = useState<AdminAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null)
  const [impersonationNotice, setImpersonationNotice] = useState('')

  useEffect(() => {
    let active = true
    const loadAthletes = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/athletes')
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load athletes.')
          setLoading(false)
        }
        return
      }
      const payload = (await response.json().catch(() => null)) as AdminAthletesResponse | null
      if (!active) return
      const rows = payload?.athletes || []
      setAthletes(rows)
      setLoading(false)
      if (rows.length) {
        setSelectedAthleteId((current) => current || rows[0].id)
      }
    }
    void loadAthletes()
    return () => {
      active = false
    }
  }, [])

  const filteredAthletes = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return athletes
    return athletes.filter((athlete) => {
      const guardianHaystack = athlete.guardian.linked_guardians
        .map((guardian) => `${guardian.name || ''} ${guardian.email || ''}`)
        .join(' ')
      const subProfileHaystack = athlete.athlete_profiles.linked_sub_profiles
        .map((profile) => `${profile.name || ''} ${profile.sport || ''} ${profile.grade_level || ''}`)
        .join(' ')
      return `${athlete.name} ${athlete.email} ${athlete.heard_from || ''} ${guardianHaystack} ${subProfileHaystack}`.toLowerCase().includes(term)
    })
  }, [athletes, search])

  useEffect(() => {
    if (!filteredAthletes.length) {
      setSelectedAthleteId(null)
      return
    }
    const hasSelection = selectedAthleteId && filteredAthletes.some((athlete) => athlete.id === selectedAthleteId)
    if (!hasSelection) setSelectedAthleteId(filteredAthletes[0].id)
  }, [filteredAthletes, selectedAthleteId])

  const selectedAthlete =
    filteredAthletes.find((athlete) => athlete.id === selectedAthleteId)
    || athletes.find((athlete) => athlete.id === selectedAthleteId)
    || null

  const activeCount = athletes.filter((athlete) => athlete.status.toLowerCase() !== 'suspended').length
  const suspendedCount = athletes.length - activeCount
  const linkedGuardianCount = athletes.filter(
    (athlete) => athlete.guardian.linked_guardians.length > 0 || athlete.guardian.profile_email,
  ).length
  const pendingApprovals = athletes.reduce((sum, athlete) => sum + athlete.approvals.pending, 0)
  const representedAthleteCount = athletes.reduce((sum, athlete) => sum + athlete.athlete_profiles.total, 0)

  const startImpersonation = async (userId: string) => {
    setImpersonationNotice('Starting impersonation...')
    const response = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: 'athlete' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setImpersonationNotice(payload.error || 'Unable to impersonate.')
      return
    }
    setImpersonationNotice(`Impersonating athlete (${userId}).`)
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
            <h1 className="display text-3xl font-semibold text-[#191919]">Athletes</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Review athlete guardian status, approvals, payments, sessions, and membership signals.
            </p>
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
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Athlete accounts', value: athletes.length.toString() },
                { label: 'Represented athletes', value: representedAthleteCount.toString() },
                { label: 'Active', value: activeCount.toString() },
                { label: 'With guardian link', value: linkedGuardianCount.toString() },
                { label: 'Pending approvals', value: pendingApprovals.toString() },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#191919]">Athlete accounts</h2>
                <p className="text-xs text-[#6b5f55]">Suspended {suspendedCount}</p>
              </div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-[1fr_auto]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Search by athlete or guardian info"
                />
              </div>
              {impersonationNotice ? <p className="mt-3 text-xs text-[#6b5f55]">{impersonationNotice}</p> : null}
              {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading athletes..." />
                ) : filteredAthletes.length === 0 ? (
                  <EmptyState title="No athletes found." description="Try adjusting your search terms." />
                ) : (
                  filteredAthletes.map((athlete) => {
                    const isSelected = selectedAthleteId === athlete.id
                    return (
                      <button
                        type="button"
                        key={athlete.id}
                        onClick={() => setSelectedAthleteId(athlete.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left ${
                          isSelected ? 'border-[#191919] bg-white' : 'border-[#dcdcdc] bg-[#f5f5f5]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#191919]">{athlete.name}</p>
                            <p className="text-xs text-[#6b5f55]">{athlete.email}</p>
                            <p className="mt-1 text-xs text-[#6b5f55]">
                              Profiles {athlete.athlete_profiles.total} · Guardians {athlete.guardian.linked_guardians.length} · Pending approvals {athlete.approvals.pending}
                            </p>
                            <p className="mt-1 text-xs text-[#6b5f55]">
                              Heard from: {athlete.heard_from || 'Not captured'}
                            </p>
                            {athlete.athlete_profiles.linked_sub_profiles.length ? (
                              <p className="mt-1 text-xs text-[#6b5f55]">
                                Linked athletes:{' '}
                                {athlete.athlete_profiles.linked_sub_profiles.map((profile) => profile.name).join(', ')}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                              {athlete.status}
                            </span>
                            <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                              {athlete.sessions.total} sessions
                            </span>
                            <button
                              type="button"
                              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                              onClick={(event) => {
                                event.stopPropagation()
                                void startImpersonation(athlete.id)
                              }}
                            >
                              Impersonate
                            </button>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Athlete visibility</h2>
              <p className="mt-2 text-sm text-[#6b5f55]">
                Selected athlete details sync directly from guardian links, approvals, sessions, payments, and messaging data.
              </p>
              {!selectedAthlete ? (
                <p className="mt-4 text-sm text-[#6b5f55]">Select an athlete to see details.</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Profile & guardians</p>
                      <p className="mt-2 font-semibold text-[#191919]">{selectedAthlete.name}</p>
                      <p className="text-xs text-[#6b5f55]">{selectedAthlete.email || '—'}</p>
                      <p className="mt-2 text-xs text-[#6b5f55]">
                        Profile guardian: {selectedAthlete.guardian.profile_name || selectedAthlete.guardian.profile_email || 'Not set'}
                      </p>
                      <p className="text-xs text-[#6b5f55]">Heard from: {selectedAthlete.heard_from || 'Not captured'}</p>
                      <p className="text-xs text-[#6b5f55]">Guardian phone: {selectedAthlete.guardian.profile_phone || 'Not set'}</p>
                      <div className="mt-2 space-y-1 text-xs text-[#6b5f55]">
                        {selectedAthlete.guardian.linked_guardians.length === 0 ? (
                          <p>No active linked guardians.</p>
                        ) : (
                          selectedAthlete.guardian.linked_guardians.map((guardian) => (
                            <p key={guardian.id}>
                              {(guardian.name || guardian.email || guardian.guardian_user_id).trim()} · {guardian.relationship || 'parent'}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Athlete profiles</p>
                      <p className="mt-2 text-sm text-[#191919]">
                        Total represented athletes: {selectedAthlete.athlete_profiles.total}
                      </p>
                      <p className="text-xs text-[#6b5f55]">
                        Linked athlete profiles: {selectedAthlete.athlete_profiles.linked_sub_profiles.length}
                      </p>
                      <p className="mt-2 text-xs text-[#6b5f55]">
                        Family account metrics above remain account-level. Linked athletes below show sub-profile-specific sessions,
                        marketplace orders, and notes.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Payments</p>
                      <p className="mt-2 text-sm text-[#191919]">
                        Last payment: {formatDateTime(selectedAthlete.payments.last_payment_at)}
                      </p>
                      <p className="text-xs text-[#6b5f55]">Lifetime spend: {formatCurrency(selectedAthlete.payments.lifetime_spend)}</p>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Sessions & attendance</p>
                      <p className="mt-2 text-sm text-[#191919]">
                        Sessions this month: {selectedAthlete.sessions.this_month}
                      </p>
                      <p className="text-xs text-[#6b5f55]">Total sessions: {selectedAthlete.sessions.total}</p>
                      <p className="text-xs text-[#6b5f55]">Attendance rate: {selectedAthlete.sessions.attendance_rate}%</p>
                    </div>
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Messages & orgs</p>
                      <p className="mt-2 text-sm text-[#191919]">
                        Last message: {formatDateTime(selectedAthlete.messaging.last_message_at)}
                      </p>
                      <p className="text-xs text-[#6b5f55]">Org memberships: {selectedAthlete.memberships.org_count}</p>
                      <p className="text-xs text-[#6b5f55]">Team memberships: {selectedAthlete.memberships.team_count}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Linked athlete profiles</p>
                    {selectedAthlete.athlete_profiles.linked_sub_profiles.length === 0 ? (
                      <p className="mt-2 text-xs text-[#6b5f55]">No additional athlete profiles are linked to this account.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {selectedAthlete.athlete_profiles.linked_sub_profiles.map((profile) => (
                          <div key={profile.id} className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-[#191919]">{profile.name}</p>
                                <p className="text-xs text-[#6b5f55]">
                                  {[profile.sport || 'General', profile.grade_level || null, profile.season || null]
                                    .filter(Boolean)
                                    .join(' · ') || 'Profile details not set'}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                                  {profile.sessions.total} sessions
                                </span>
                                <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                                  {profile.orders.total} orders
                                </span>
                                <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                                  {profile.notes.total} notes
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 text-xs text-[#6b5f55] md:grid-cols-2 xl:grid-cols-4">
                              <p>Sessions this month: {profile.sessions.this_month}</p>
                              <p>Attendance rate: {profile.sessions.attendance_rate}%</p>
                              <p>Marketplace spend: {formatCurrency(profile.orders.lifetime_spend)}</p>
                              <p>Last activity: {formatDateTime(profile.last_activity_at)}</p>
                              <p>Last marketplace order: {formatDateTime(profile.orders.last_order_at)}</p>
                              <p>Last note: {formatDateTime(profile.notes.last_note_at)}</p>
                              <p>Location: {profile.location || '—'}</p>
                              <p>Created: {formatDateTime(profile.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Guardian approvals</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#191919]">
                      <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold">
                        Pending {selectedAthlete.approvals.pending}
                      </span>
                      <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold">
                        Approved {selectedAthlete.approvals.approved}
                      </span>
                      <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold">
                        Denied {selectedAthlete.approvals.denied}
                      </span>
                      <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold">
                        Expired {selectedAthlete.approvals.expired}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#6b5f55]">
                      Last request: {selectedAthlete.approvals.last_status || '—'} · {selectedAthlete.approvals.last_scope || '—'} ·{' '}
                      {selectedAthlete.approvals.last_target_label || selectedAthlete.approvals.last_target_type || '—'} ·{' '}
                      {formatDateTime(selectedAthlete.approvals.last_created_at)}
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
