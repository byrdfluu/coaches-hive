'use client'

import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import { FeeTier, getFeePercentage } from '@/lib/platformFees'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { useEffect, useMemo, useState } from 'react'

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

type SessionRow = {
  id: string
  title?: string | null
  start_time?: string | null
  status?: string | null
  athlete_id?: string | null
  location?: string | null
  notes?: string | null
  price?: number | string | null
  price_cents?: number | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

type CancelTarget = { id: string; label: string }

const formatSessionTime = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatCurrency = (value: number) => `\$${value.toFixed(2).replace(/\.00$/, '')}`

export default function CoachBookingsPage() {
  const supabase = createClientComponentClient()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [coachTier, setCoachTier] = useState<FeeTier>('starter')
  const [feeRules, setFeeRules] = useState<Array<{ tier: string; category: string; percentage: number }>>([])
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }
    loadUser()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    if (!currentUserId) return
    let mounted = true
    const loadSessions = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('coach_id', currentUserId)
        .order('start_time', { ascending: true })

      const { data: planRow } = await supabase
        .from('coach_plans')
        .select('tier')
        .eq('coach_id', currentUserId)
        .maybeSingle()

      const { data: feeRuleRows } = await supabase
        .from('platform_fee_rules')
        .select('tier, category, percentage')
        .eq('active', true)

      if (!mounted) return
      const rows = (data || []) as SessionRow[]
      setSessions(rows)
      if (planRow?.tier) {
        setCoachTier(planRow.tier as FeeTier)
      }
      setFeeRules((feeRuleRows || []) as Array<{ tier: string; category: string; percentage: number }>)

      const athleteIds = Array.from(new Set(rows.map((row) => row.athlete_id).filter(Boolean) as string[]))
      if (athleteIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', athleteIds)
        if (!mounted) return
        const nameMap: Record<string, string> = {}
        const athleteProfiles = (profiles || []) as ProfileRow[]
        athleteProfiles.forEach((profile) => {
          if (profile.full_name) {
            nameMap[profile.id] = profile.full_name
          }
        })
        setAthleteNames(nameMap)
      } else {
        setAthleteNames({})
      }
      setLoading(false)
    }
    loadSessions()
    return () => {
      mounted = false
    }
  }, [currentUserId, supabase])

  const bookingSummary = useMemo(() => {
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() + 7)
    const nextWeekEnd = new Date(now)
    nextWeekEnd.setDate(now.getDate() + 14)

    let thisWeek = 0
    let nextWeek = 0
    let reschedules = 0
    let feeTotal = 0

    const feePercent = getFeePercentage(coachTier, 'session', feeRules)

    sessions.forEach((session) => {
      const start = session.start_time ? new Date(session.start_time) : null
      if (start && start >= now && start < weekEnd) thisWeek += 1
      if (start && start >= weekEnd && start < nextWeekEnd) nextWeek += 1
      if ((session.status || '').toLowerCase().includes('reschedule')) reschedules += 1
      if (start && start >= now && start < weekEnd) {
        const price = session.price_cents ? session.price_cents / 100 : Number.parseFloat(String(session.price || 0))
        if (!Number.isNaN(price)) {
          feeTotal += price * (feePercent / 100)
        }
      }
    })

    return [
      { label: 'This week', value: String(thisWeek) },
      { label: 'Next week', value: String(nextWeek) },
      { label: 'Reschedules', value: String(reschedules) },
      { label: 'Est. fees', value: formatCurrency(feeTotal) },
    ]
  }, [sessions, coachTier, feeRules])

  const upcomingSessions = useMemo(() => {
    const now = new Date()
    return sessions
      .filter((session) => session.start_time && new Date(session.start_time) >= now)
      .slice(0, 6)
  }, [sessions])

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    await fetch('/api/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cancelTarget.id, status: 'cancelled', cancel_reason: cancelReason }),
    })
    setSessions((prev) => prev.map((s) => s.id === cancelTarget.id ? { ...s, status: 'cancelled' } : s))
    setCancelTarget(null)
    setCancelReason('')
    setCancelling(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Bookings</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Sessions for the week</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">See upcoming sessions and reschedules.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/coach/settings#export-center" className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Go to export center
            </Link>
            <Link href="/coach/dashboard" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Back to dashboard
            </Link>
            <Link href="/coach/calendar" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
              View calendar
            </Link>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {bookingSummary.map((item) => (
            <div key={item.label} className="glass-card border border-[#191919] bg-white p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#191919]">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 glass-card border border-[#191919] bg-white p-6">
          <h2 className="text-xl font-semibold text-[#191919]">Upcoming sessions</h2>
          <p className="mt-2 text-sm text-[#4a4a4a]">Tap into details or reschedule.</p>
          <div className="mt-4 space-y-3 text-sm">
            {loading ? (
              <LoadingState label="Loading sessions..." />
            ) : upcomingSessions.length === 0 ? (
              <EmptyState title="No upcoming sessions yet." description="Open new availability to get booked." />
            ) : (
              upcomingSessions.map((session) => {
                const athleteName = session.athlete_id ? athleteNames[session.athlete_id] : ''
                const athleteSlug = athleteName ? slugify(athleteName) : ''
                return (
                  <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div>
                      {athleteSlug ? (
                        <Link
                          href={`/coach/athletes/${athleteSlug}`}
                          className="text-[#191919] font-semibold underline decoration-[#191919]/40 decoration-2 underline-offset-4 hover:decoration-[#191919]"
                        >
                          {athleteName}
                        </Link>
                      ) : (
                        <p className="text-[#191919] font-semibold">{session.title || 'Session'}</p>
                      )}
                      <p className="text-[#4a4a4a]">{formatSessionTime(session.start_time)}</p>
                      {session.location && <p className="text-[#4a4a4a] text-xs">{session.location}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                        {session.status || 'Scheduled'}
                      </span>
                      {(session.status || '').toLowerCase() !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget({ id: session.id, label: session.title || athleteName || 'Session' })}
                          className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#6b5f55] hover:border-[#b80f0a] hover:text-[#b80f0a] transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Cancel session</p>
            <h2 className="mt-2 text-xl font-semibold text-[#191919]">{cancelTarget.label}</h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">This will mark the session as cancelled. Refunds must be processed separately in Stripe.</p>
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-[#191919]">Reason (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Scheduling conflict, injury, etc."
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Confirm cancel'}
              </button>
              <button
                type="button"
                onClick={() => { setCancelTarget(null); setCancelReason('') }}
                className="rounded-full border border-[#dcdcdc] px-5 py-2 text-sm font-semibold text-[#191919]"
              >
                Keep session
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
