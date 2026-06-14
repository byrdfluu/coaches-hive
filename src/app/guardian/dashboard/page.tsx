'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import GuardianSidebar from '@/components/GuardianSidebar'
import OnboardingModal from '@/components/OnboardingModal'

type LinkedAthlete = {
  id: string
  athlete_id: string
  status: string
  related_profile?: {
    full_name?: string | null
    email?: string | null
    role?: string | null
  } | null
}

type PendingApproval = {
  id: string
  athlete_id: string
  scope: string
  target_type?: string | null
  target_label?: string | null
  expires_at?: string | null
  status: string
  created_at: string
}

type UpcomingGame = {
  id: string
  org_id: string
  team_id?: string | null
  title: string
  game_type?: string | null
  opponent_name?: string | null
  game_date?: string | null
  game_time?: string | null
  home_away?: string | null
  score_us?: number | null
  score_them?: number | null
  result?: string | null
}

export default function GuardianDashboardPage() {
  const [athletes, setAthletes] = useState<LinkedAthlete[]>([])
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)

  useEffect(() => {
    let active = true
    const loadOnboarding = async () => {
      const localSeen = typeof window !== 'undefined'
        && window.localStorage.getItem('ch_onboarding_guardian_v1') === '1'
      const response = await fetch('/api/onboarding').catch(() => null)
      const payload = response?.ok ? await response.json().catch(() => null) : null
      if (!active) return
      const completedSteps = Array.isArray(payload?.onboarding?.completed_steps)
        ? payload.onboarding.completed_steps
        : []
      const seen = payload?.onboarding
        ? completedSteps.includes('modal_seen')
        : localSeen
      setShowOnboarding(!seen)
    }
    void loadOnboarding()
    return () => {
      active = false
    }
  }, [])

  const handleCloseOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ch_onboarding_guardian_v1', '1')
    }
    setShowOnboarding(false)
    void fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'guardian',
        completed_steps: ['modal_seen'],
        total_steps: 1,
      }),
    }).catch(() => null)
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setLoadError('')
      const [linksRes, approvalsRes] = await Promise.all([
        fetch('/api/guardian-links').catch(() => null),
        fetch('/api/guardian-approvals?status=pending').catch(() => null),
      ])
      if (!active) return
      if (linksRes?.ok) {
        const data = await linksRes.json()
        setAthletes(data.links || [])
      } else {
        setAthletes([])
        setLoadError('Unable to load guardian dashboard data. Refresh the page to try again.')
      }
      if (approvalsRes?.ok) {
        const data = await approvalsRes.json()
        setApprovals((data.approvals || []).filter((a: PendingApproval) => a.status === 'pending'))
      } else {
        setApprovals([])
        setLoadError('Unable to load guardian dashboard data. Refresh the page to try again.')
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const handleDecision = async (approvalId: string, action: 'approve' | 'deny') => {
    if (actingId) return
    setActingId(approvalId)
    setActionError('')
    try {
      const res = await fetch('/api/guardian-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_id: approvalId, action }),
      }).catch(() => null)
      const data = await res?.json().catch(() => null)
      if (!res?.ok) {
        setActionError(data?.error || 'Unable to process decision. Please try again.')
      } else {
        setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
      }
    } finally {
      setActingId(null)
    }
  }

  useEffect(() => {
    let active = true
    fetch('/api/guardian/org-games')
      .then((res) => res.ok ? res.json() : { games: [] })
      .then((data) => { if (active) { setUpcomingGames(data.games || []); setGamesLoading(false) } })
      .catch(() => { if (active) { setUpcomingGames([]); setGamesLoading(false) } })
    return () => { active = false }
  }, [])

  const pendingCountForAthlete = (athleteId: string) =>
    approvals.filter((a) => a.athlete_id === athleteId).length

  const formatGameDate = (date?: string | null, time?: string | null) => {
    if (!date) return ''
    const d = new Date(date + (time ? `T${time}` : 'T00:00'))
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
    if (!time) return datePart
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${datePart} · ${timePart}`
  }

  return (
    <main className="page-shell">
      <OnboardingModal role="guardian" open={showOnboarding} onClose={handleCloseOnboarding} />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="guardian" />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Guardian</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Dashboard</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Manage your linked athletes and review pending approvals.
          </p>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <GuardianSidebar />
          <div className="space-y-6">
            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
                Loading…
              </div>
            ) : (
              <>
                {loadError && (
                  <div className="rounded-2xl border border-[#b80f0a] bg-white px-4 py-3 text-sm text-[#b80f0a]">
                    {loadError}
                  </div>
                )}
                {/* Linked athletes */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">Linked athletes</h2>
                  {athletes.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">
                      No linked athletes yet. Athletes can request guardian approval from their account.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {athletes.map((link) => {
                        const name = link.related_profile?.full_name || link.related_profile?.email || 'Athlete'
                        const pendingCount = pendingCountForAthlete(link.athlete_id)
                        return (
                          <div
                            key={link.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                          >
                            <div>
                              <p className="font-semibold text-[#191919]">{name}</p>
                              <p className="text-xs text-[#4a4a4a]">{link.related_profile?.email || ''}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {pendingCount > 0 && (
                                <span className="rounded-full bg-[#b80f0a] px-2 py-0.5 text-xs font-bold text-white">
                                  {pendingCount} pending
                                </span>
                              )}
                              <Link
                                href={`/guardian/approvals?athlete=${link.athlete_id}`}
                                className="rounded-full border border-[#191919] px-3 py-2.5 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-white transition-colors"
                              >
                                View approvals
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                {/* Upcoming games */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">Upcoming games</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Games scheduled for your linked athletes&apos; teams.</p>
                  {gamesLoading ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">Loading…</p>
                  ) : upcomingGames.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">No upcoming games found.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {upcomingGames.slice(0, 8).map((game) => (
                        <div
                          key={game.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                        >
                          <div>
                            <p className="text-xs text-[#4a4a4a]">{formatGameDate(game.game_date, game.game_time)}</p>
                            <p className="font-semibold text-[#191919]">vs {game.opponent_name || game.title}</p>
                            {game.game_type && game.game_type !== 'game' && (
                              <p className="text-xs capitalize text-[#4a4a4a]">{game.game_type}</p>
                            )}
                          </div>
                          {game.home_away && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${game.home_away === 'home' ? 'bg-[#191919] text-white' : 'border border-[#191919] text-[#191919]'}`}>
                              {game.home_away === 'home' ? 'Home' : game.home_away === 'away' ? 'Away' : 'Neutral'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Pending approvals */}
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">Pending approvals</h2>
                  {actionError && (
                    <p className="mt-2 text-xs text-[#b80f0a]">{actionError}</p>
                  )}
                  {approvals.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">No pending approvals. You&apos;re all caught up.</p>
                  ) : (
                    <div className="mt-4 space-y-3 text-sm">
                      {approvals.map((approval) => {
                        const athleteLink = athletes.find((a) => a.athlete_id === approval.athlete_id)
                        const athleteName = athleteLink?.related_profile?.full_name || 'Athlete'
                        const expiresAt = approval.expires_at ? new Date(approval.expires_at) : null
                        const isExpired = expiresAt ? expiresAt < new Date() : false
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
                                {expiresAt && !isExpired && (
                                  <p className="mt-0.5 text-xs text-[#4a4a4a]">
                                    Expires {expiresAt.toLocaleDateString()}
                                  </p>
                                )}
                                {isExpired && (
                                  <p className="mt-0.5 text-xs text-[#b80f0a]">Expired</p>
                                )}
                              </div>
                              {!isExpired && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDecision(approval.id, 'approve')}
                                    disabled={actingId === approval.id}
                                    className="rounded-full bg-[#191919] px-3 py-2.5 text-xs font-semibold text-white hover:opacity-80 disabled:opacity-50 transition-opacity"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDecision(approval.id, 'deny')}
                                    disabled={actingId === approval.id}
                                    className="rounded-full border border-[#b80f0a] px-3 py-2.5 text-xs font-semibold text-[#b80f0a] hover:bg-[#b80f0a] hover:text-white disabled:opacity-50 transition-colors"
                                  >
                                    Deny
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
