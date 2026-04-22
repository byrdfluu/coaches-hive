'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'

type SessionRow = {
  id: string
  start_time?: string | null
  end_time?: string | null
  status?: string | null
  session_type?: string | null
  attendance_status?: string | null
  athlete_id?: string | null
  duration_minutes?: number | null
  price?: number | string | null
  price_cents?: number | string | null
}

type OrderRow = {
  id: string
  created_at?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
}

type PayoutRow = {
  id: string
  amount?: number | string | null
  status?: string | null
  paid_at?: string | null
  scheduled_for?: string | null
  created_at?: string | null
}

type CoachAthleteLinkRow = {
  athlete_id?: string | null
  status?: string | null
}

type ReviewRow = {
  id: string
  athlete_id?: string | null
  rating?: number | null
  verified?: boolean | null
  created_at?: string | null
}

type ModalState =
  | { kind: 'sessions' }
  | { kind: 'athletes' }
  | { kind: 'attendance' }
  | { kind: 'revenue' }
  | { kind: 'payouts' }
  | { kind: 'reviews'; focus?: 'total' | 'average' | 'verified' }
  | { kind: 'month'; monthKey: string }
  | { kind: 'sessionType'; sessionType: string }
  | { kind: 'athlete'; athleteId: string }
  | { kind: 'payout'; payoutId: string }

type AthleteSnapshot = {
  athleteId: string
  name: string
  sessions: number
  completed: number
  attendanceMarked: number
  attendancePresent: number
  lastDate: string | null
}

const toNumber = (value: unknown) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

const monthKeyFromValue = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 7)
}

const monthLabel = (key: string) => {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('en-US', { month: 'short' })
}

const fullMonthLabel = (key: string) => {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

const dateLabel = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const dateTimeLabel = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const normalizeStatus = (value?: string | null) => String(value || '').trim().toLowerCase()

const buildMonthWindow = (count: number) => {
  const now = new Date()
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

export default function CoachReportsPage() {
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [links, setLinks] = useState<CoachAthleteLinkRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({})
  const [modal, setModal] = useState<ModalState | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        if (active) setLoading(false)
        return
      }

      const [sessionRes, orderRes, payoutRes, linkRes, reviewRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, start_time, end_time, status, session_type, attendance_status, athlete_id, duration_minutes, price, price_cents')
          .eq('coach_id', userId),
        supabase.from('orders').select('id, created_at, amount, total, price').eq('coach_id', userId),
        supabase.from('coach_payouts').select('id, amount, status, paid_at, scheduled_for, created_at').eq('coach_id', userId),
        supabase.from('coach_athlete_links').select('athlete_id, status').eq('coach_id', userId),
        supabase.from('coach_reviews').select('id, athlete_id, rating, verified, created_at').eq('coach_id', userId),
      ])

      if (!active) return
      const nextSessions = (sessionRes.data || []) as SessionRow[]
      const nextOrders = (orderRes.data || []) as OrderRow[]
      const nextPayouts = (payoutRes.data || []) as PayoutRow[]
      const nextLinks = (linkRes.data || []) as CoachAthleteLinkRow[]
      const nextReviews = (reviewRes.data || []) as ReviewRow[]

      setSessions(nextSessions)
      setOrders(nextOrders)
      setPayouts(nextPayouts)
      setLinks(nextLinks)
      setReviews(nextReviews)

      const athleteIds = Array.from(
        new Set(
          [
            ...nextSessions.map((session) => session.athlete_id),
            ...nextLinks.map((link) => link.athlete_id),
            ...nextReviews.map((review) => review.athlete_id),
          ].filter(Boolean) as string[]
        )
      )

      if (athleteIds.length > 0) {
        const { data: profileRows } = await supabase.from('profiles').select('id, full_name').in('id', athleteIds)
        if (!active) return
        const athleteProfiles = (profileRows || []) as Array<{ id: string; full_name?: string | null }>
        const map: Record<string, string> = {}
        athleteProfiles.forEach((row) => {
          map[row.id] = row.full_name || 'Athlete'
        })
        setAthleteNames(map)
      } else {
        setAthleteNames({})
      }

      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [supabase])

  const sessionsForDisplay = sessions
  const ordersForDisplay = orders
  const payoutsForDisplay = payouts
  const linksForDisplay = links
  const reviewsForDisplay = reviews
  const athleteNamesForDisplay: Record<string, string> = athleteNames

  const sessionsSorted = useMemo(
    () =>
      [...sessionsForDisplay].sort((a, b) => {
        const aTime = new Date(a.start_time || 0).getTime()
        const bTime = new Date(b.start_time || 0).getTime()
        return bTime - aTime
      }),
    [sessionsForDisplay]
  )

  const ordersSorted = useMemo(
    () =>
      [...ordersForDisplay].sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime()
        const bTime = new Date(b.created_at || 0).getTime()
        return bTime - aTime
      }),
    [ordersForDisplay]
  )

  const payoutsSorted = useMemo(
    () =>
      [...payoutsForDisplay].sort((a, b) => {
        const aTime = new Date(a.paid_at || a.scheduled_for || a.created_at || 0).getTime()
        const bTime = new Date(b.paid_at || b.scheduled_for || b.created_at || 0).getTime()
        return bTime - aTime
      }),
    [payoutsForDisplay]
  )

  const reviewsSorted = useMemo(
    () =>
      [...reviewsForDisplay].sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime()
        const bTime = new Date(b.created_at || 0).getTime()
        return bTime - aTime
      }),
    [reviewsForDisplay]
  )

  const totalSessions = sessionsForDisplay.length
  const completedSessions = sessionsForDisplay.filter((session) => normalizeStatus(session.status).includes('complete')).length
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const upcomingSessions = sessionsForDisplay.filter((session) => {
    if (!session.start_time) return false
    const date = new Date(session.start_time)
    return !Number.isNaN(date.getTime()) && date >= now && date <= nextWeek
  }).length

  const attendanceMarked = sessionsForDisplay.filter((session) =>
    ['present', 'absent', 'excused'].includes(normalizeStatus(session.attendance_status))
  )
  const attendancePresent = attendanceMarked.filter((session) => normalizeStatus(session.attendance_status) === 'present').length
  const attendanceRate = attendanceMarked.length ? Math.round((attendancePresent / attendanceMarked.length) * 100) : 0

  const sessionRevenueTotal = sessionsForDisplay.reduce((sum, s) => sum + toNumber(s.price), 0)
  const revenueTotal = ordersForDisplay.reduce((sum, order) => sum + toNumber(order.amount ?? order.total ?? order.price), 0) + sessionRevenueTotal
  const payoutsPaidTotal = payoutsForDisplay
    .filter((row) => normalizeStatus(row.status).includes('paid'))
    .reduce((sum, row) => sum + toNumber(row.amount), 0)
  const payoutsPendingTotal = payoutsForDisplay
    .filter((row) => ['scheduled', 'pending', 'processing'].includes(normalizeStatus(row.status)))
    .reduce((sum, row) => sum + toNumber(row.amount), 0)

  const activeAthleteIds = new Set(
    linksForDisplay
      .filter((link) => !['inactive', 'revoked', 'archived'].includes(normalizeStatus(link.status)))
      .map((link) => link.athlete_id)
      .filter(Boolean) as string[]
  )
  if (activeAthleteIds.size === 0) {
    sessionsForDisplay.forEach((session) => {
      if (session.athlete_id) activeAthleteIds.add(session.athlete_id)
    })
  }

  const totalHours = sessionsForDisplay.reduce((sum, session) => sum + toNumber(session.duration_minutes), 0) / 60
  const averageRating = reviewsForDisplay.length
    ? reviewsForDisplay.reduce((sum, review) => sum + toNumber(review.rating), 0) / reviewsForDisplay.length
    : 0
  const verifiedReviewRate = reviewsForDisplay.length
    ? Math.round((reviewsForDisplay.filter((review) => Boolean(review.verified)).length / reviewsForDisplay.length) * 100)
    : 0

  const sessionTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    sessionsForDisplay.forEach((session) => {
      const key = String(session.session_type || '1:1')
      map.set(key, (map.get(key) || 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [sessionsForDisplay])

  const monthlyRows = useMemo(() => {
    const months = buildMonthWindow(6)
    const map = new Map(months.map((key) => [key, { key, sessions: 0, revenue: 0, payouts: 0 }]))
    sessionsForDisplay.forEach((session) => {
      const key = monthKeyFromValue(session.start_time)
      if (!key || !map.has(key)) return
      map.get(key)!.sessions += 1
      map.get(key)!.revenue += toNumber(session.price)
    })
    ordersForDisplay.forEach((order) => {
      const key = monthKeyFromValue(order.created_at)
      if (!key || !map.has(key)) return
      map.get(key)!.revenue += toNumber(order.amount ?? order.total ?? order.price)
    })
    payoutsForDisplay.forEach((payout) => {
      const key = monthKeyFromValue(payout.paid_at || payout.scheduled_for || payout.created_at)
      if (!key || !map.has(key)) return
      map.get(key)!.payouts += toNumber(payout.amount)
    })
    return months.map((key) => map.get(key)!)
  }, [ordersForDisplay, payoutsForDisplay, sessionsForDisplay])

  const maxMonthlyRevenue = Math.max(1, ...monthlyRows.map((row) => row.revenue))
  const maxMonthlySessions = Math.max(1, ...monthlyRows.map((row) => row.sessions))

  const athleteSnapshots = useMemo<AthleteSnapshot[]>(() => {
    const map = new Map<string, AthleteSnapshot>()

    sessionsForDisplay.forEach((session) => {
      if (!session.athlete_id) return
      const athleteId = session.athlete_id
      const current = map.get(athleteId) || {
        athleteId,
        name: athleteNamesForDisplay[athleteId] || 'Athlete',
        sessions: 0,
        completed: 0,
        attendanceMarked: 0,
        attendancePresent: 0,
        lastDate: null,
      }
      current.sessions += 1
      if (normalizeStatus(session.status).includes('complete')) current.completed += 1

      const attendance = normalizeStatus(session.attendance_status)
      if (['present', 'absent', 'excused'].includes(attendance)) {
        current.attendanceMarked += 1
      }
      if (attendance === 'present') {
        current.attendancePresent += 1
      }

      if (!current.lastDate || (session.start_time && session.start_time > current.lastDate)) {
        current.lastDate = session.start_time || current.lastDate
      }
      map.set(athleteId, current)
    })

    linksForDisplay.forEach((link) => {
      if (!link.athlete_id) return
      if (!map.has(link.athlete_id)) {
        map.set(link.athlete_id, {
          athleteId: link.athlete_id,
          name: athleteNamesForDisplay[link.athlete_id] || 'Athlete',
          sessions: 0,
          completed: 0,
          attendanceMarked: 0,
          attendancePresent: 0,
          lastDate: null,
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions)
  }, [athleteNamesForDisplay, linksForDisplay, sessionsForDisplay])

  const athleteEngagement = useMemo(() => athleteSnapshots.slice(0, 6), [athleteSnapshots])

  const attendanceByType = useMemo(() => {
    const map = new Map<string, { marked: number; present: number }>()
    sessionsForDisplay.forEach((session) => {
      const sessionType = String(session.session_type || '1:1')
      const status = normalizeStatus(session.attendance_status)
      if (!['present', 'absent', 'excused'].includes(status)) return
      const current = map.get(sessionType) || { marked: 0, present: 0 }
      current.marked += 1
      if (status === 'present') current.present += 1
      map.set(sessionType, current)
    })
    return Array.from(map.entries())
      .map(([type, value]) => ({
        type,
        marked: value.marked,
        present: value.present,
        rate: value.marked ? Math.round((value.present / value.marked) * 100) : 0,
      }))
      .sort((a, b) => b.marked - a.marked)
  }, [sessionsForDisplay])

  const payoutTimeline = useMemo(() => payoutsSorted.slice(0, 6), [payoutsSorted])
  const payoutById = useMemo(() => new Map(payoutsForDisplay.map((payout) => [payout.id, payout])), [payoutsForDisplay])

  const modalContent = useMemo(() => {
    if (!modal) return null

    if (modal.kind === 'sessions') {
      return {
        title: 'Session details',
        body: (
          <div className="space-y-3">
            {sessionsSorted.length === 0 ? (
              <p className="text-sm text-[#4a4a4a]">No sessions yet.</p>
            ) : (
              sessionsSorted.map((session) => (
                <div key={session.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                  <p className="font-semibold text-[#191919]">{session.session_type || '1:1'}</p>
                  <p className="text-xs text-[#4a4a4a]">
                    {dateTimeLabel(session.start_time)} · {athleteNamesForDisplay[session.athlete_id || ''] || 'Athlete'}
                  </p>
                  <p className="text-xs text-[#4a4a4a]">
                    Status: {session.status || '—'} · Attendance: {session.attendance_status || 'not marked'}
                  </p>
                </div>
              ))
            )}
          </div>
        ),
      }
    }

    if (modal.kind === 'athletes') {
      return {
        title: 'Active athletes',
        body: (
          <div className="space-y-3">
            {athleteSnapshots.length === 0 ? (
              <p className="text-sm text-[#4a4a4a]">No athlete activity yet.</p>
            ) : (
              athleteSnapshots.map((athlete) => (
                <button
                  key={athlete.athleteId}
                  type="button"
                  onClick={() => setModal({ kind: 'athlete', athleteId: athlete.athleteId })}
                  className="w-full rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left transition hover:border-[#191919]"
                >
                  <p className="font-semibold text-[#191919]">{athlete.name}</p>
                  <p className="text-xs text-[#4a4a4a]">
                    {athlete.sessions} sessions · {athlete.completed} completed · last session {dateLabel(athlete.lastDate)}
                  </p>
                </button>
              ))
            )}
          </div>
        ),
      }
    }

    if (modal.kind === 'attendance') {
      return {
        title: 'Attendance breakdown',
        body: (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Overall</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{attendanceRate}% present</p>
              <p className="text-xs text-[#4a4a4a]">
                {attendancePresent}/{attendanceMarked.length || 0} marked sessions
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">By session type</p>
              <div className="mt-2 space-y-2">
                {attendanceByType.length === 0 ? (
                  <p className="text-sm text-[#4a4a4a]">No marked attendance yet.</p>
                ) : (
                  attendanceByType.map((item) => (
                    <div key={item.type} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                      <p className="font-semibold text-[#191919]">{item.type}</p>
                      <p className="text-xs text-[#4a4a4a]">
                        {item.rate}% present ({item.present}/{item.marked})
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ),
      }
    }

    if (modal.kind === 'revenue') {
      return {
        title: 'Revenue details',
        body: (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Total revenue</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(revenueTotal)}</p>
              <p className="text-xs text-[#4a4a4a]">{sessionsForDisplay.filter((s) => toNumber(s.price) > 0).length} paid sessions · {ordersSorted.length} marketplace orders</p>
            </div>
            <div className="space-y-2">
              {ordersSorted.length === 0 ? (
                <p className="text-sm text-[#4a4a4a]">No orders yet.</p>
              ) : (
                ordersSorted.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                    <p className="font-semibold text-[#191919]">{formatCurrency(toNumber(order.amount ?? order.total ?? order.price))}</p>
                    <p className="text-xs text-[#4a4a4a]">Order {order.id.slice(0, 8)} · {dateTimeLabel(order.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ),
      }
    }

    if (modal.kind === 'payouts') {
      return {
        title: 'Payout details',
        body: (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Paid</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(payoutsPaidTotal)}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Pending/scheduled</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(payoutsPendingTotal)}</p>
              </div>
            </div>
            <div className="space-y-2">
              {payoutsSorted.length === 0 ? (
                <p className="text-sm text-[#4a4a4a]">No payouts yet.</p>
              ) : (
                payoutsSorted.map((payout) => (
                  <button
                    key={payout.id}
                    type="button"
                    onClick={() => setModal({ kind: 'payout', payoutId: payout.id })}
                    className="w-full rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left transition hover:border-[#191919]"
                  >
                    <p className="font-semibold text-[#191919]">{formatCurrency(toNumber(payout.amount))}</p>
                    <p className="text-xs text-[#4a4a4a]">
                      {dateLabel(payout.paid_at || payout.scheduled_for || payout.created_at)} · {payout.status || 'scheduled'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        ),
      }
    }

    if (modal.kind === 'reviews') {
      const filtered = reviewsSorted.filter((review) => {
        if (modal.focus === 'verified') return Boolean(review.verified)
        if (modal.focus === 'average') return true
        if (modal.focus === 'total') return true
        return true
      })
      return {
        title: 'Reviews detail',
        body: (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Total</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{reviewsForDisplay.length}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Average</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">
                  {reviewsForDisplay.length ? averageRating.toFixed(1) : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Verified share</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{verifiedReviewRate}%</p>
              </div>
            </div>
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-[#4a4a4a]">No reviews yet.</p>
              ) : (
                filtered.map((review) => (
                  <div key={review.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                    <p className="font-semibold text-[#191919]">
                      {athleteNamesForDisplay[review.athlete_id || ''] || 'Athlete'} · {toNumber(review.rating).toFixed(1)} / 5
                    </p>
                    <p className="text-xs text-[#4a4a4a]">
                      {dateLabel(review.created_at)} · {review.verified ? 'Verified' : 'Unverified'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ),
      }
    }

    if (modal.kind === 'month') {
      const monthSessions = sessionsSorted.filter((session) => monthKeyFromValue(session.start_time) === modal.monthKey)
      const monthOrders = ordersSorted.filter((order) => monthKeyFromValue(order.created_at) === modal.monthKey)
      const monthPayouts = payoutsSorted.filter(
        (payout) => monthKeyFromValue(payout.paid_at || payout.scheduled_for || payout.created_at) === modal.monthKey
      )
      const monthSessionRevenue = monthSessions.reduce((sum, s) => sum + toNumber(s.price), 0)
      const monthRevenue = monthOrders.reduce((sum, order) => sum + toNumber(order.amount ?? order.total ?? order.price), 0) + monthSessionRevenue

      return {
        title: `${fullMonthLabel(modal.monthKey)} details`,
        body: (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Sessions</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{monthSessions.length}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Revenue</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(monthRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Payouts</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{monthPayouts.length}</p>
              </div>
            </div>
            <div className="space-y-2">
              {monthSessions.length === 0 ? (
                <p className="text-sm text-[#4a4a4a]">No sessions this month.</p>
              ) : (
                monthSessions.map((session) => (
                  <div key={session.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                    <p className="font-semibold text-[#191919]">{session.session_type || '1:1'}</p>
                    <p className="text-xs text-[#4a4a4a]">
                      {dateTimeLabel(session.start_time)} · {athleteNamesForDisplay[session.athlete_id || ''] || 'Athlete'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ),
      }
    }

    if (modal.kind === 'sessionType') {
      const typedSessions = sessionsSorted.filter((session) => String(session.session_type || '1:1') === modal.sessionType)
      return {
        title: `${modal.sessionType} sessions`,
        body: (
          <div className="space-y-3">
            {typedSessions.length === 0 ? (
              <p className="text-sm text-[#4a4a4a]">No sessions for this type.</p>
            ) : (
              typedSessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                  <p className="font-semibold text-[#191919]">{dateTimeLabel(session.start_time)}</p>
                  <p className="text-xs text-[#4a4a4a]">
                    {athleteNamesForDisplay[session.athlete_id || ''] || 'Athlete'} · {session.status || 'scheduled'}
                  </p>
                </div>
              ))
            )}
          </div>
        ),
      }
    }

    if (modal.kind === 'athlete') {
      const athlete = athleteSnapshots.find((entry) => entry.athleteId === modal.athleteId)
      const athleteSessions = sessionsSorted.filter((session) => session.athlete_id === modal.athleteId)
      const attendance = athlete?.attendanceMarked
        ? Math.round((athlete.attendancePresent / athlete.attendanceMarked) * 100)
        : 0
      return {
        title: athlete?.name || 'Athlete detail',
        body: (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Sessions</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{athlete?.sessions || 0}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Completed</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{athlete?.completed || 0}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Attendance</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">
                  {athlete?.attendanceMarked ? `${attendance}%` : '—'}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {athleteSessions.length === 0 ? (
                <p className="text-sm text-[#4a4a4a]">No sessions yet.</p>
              ) : (
                athleteSessions.map((session) => (
                  <div key={session.id} className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
                    <p className="font-semibold text-[#191919]">{session.session_type || '1:1'}</p>
                    <p className="text-xs text-[#4a4a4a]">
                      {dateTimeLabel(session.start_time)} · {session.status || 'scheduled'}
                    </p>
                    <p className="text-xs text-[#4a4a4a]">Attendance: {session.attendance_status || 'not marked'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ),
      }
    }

    if (modal.kind === 'payout') {
      const payout = payoutById.get(modal.payoutId)
      if (!payout) {
        return {
          title: 'Payout detail',
          body: <p className="text-sm text-[#4a4a4a]">Payout not found.</p>,
        }
      }
      return {
        title: 'Payout detail',
        body: (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Amount</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(toNumber(payout.amount))}</p>
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Status</p>
              <p className="mt-2 text-sm font-semibold text-[#191919]">{payout.status || 'scheduled'}</p>
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Date</p>
              <p className="mt-2 text-sm text-[#191919]">
                {dateTimeLabel(payout.paid_at || payout.scheduled_for || payout.created_at)}
              </p>
            </div>
          </div>
        ),
      }
    }

    return null
  }, [
    athleteNamesForDisplay,
    athleteSnapshots,
    attendanceByType,
    attendanceMarked.length,
    attendancePresent,
    attendanceRate,
    modal,
    ordersSorted,
    payoutById,
    payoutsPaidTotal,
    payoutsPendingTotal,
    payoutsSorted,
    revenueTotal,
    reviewsForDisplay.length,
    reviewsSorted,
    sessionsForDisplay,
    sessionsSorted,
    verifiedReviewRate,
    averageRating,
  ])

  const metricButtonClass =
    'flex flex-col rounded-2xl border border-[#e5e5e5] bg-white p-4 text-left transition hover:border-[#191919] hover:shadow-sm'

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Reports</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Coach reports</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Sessions, revenue, payouts, and athlete engagement in one dashboard.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 text-sm">
            <Link
              href="/coach/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <Link
              href="/coach/dashboard"
              className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Back to dashboard
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="min-w-0 space-y-6">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <button type="button" onClick={() => setModal({ kind: 'sessions' })} className={metricButtonClass}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{totalSessions}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">{completedSessions} completed · {upcomingSessions} next 7 days</p>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'athletes' })} className={metricButtonClass}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Active athletes</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{activeAthleteIds.size}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">{totalHours.toFixed(1)} coaching hours logged</p>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'attendance' })} className={metricButtonClass}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance rate</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{attendanceRate}%</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">{attendancePresent}/{attendanceMarked.length || 0} marked present</p>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'revenue' })} className={metricButtonClass}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Revenue</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{formatCurrency(revenueTotal)}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">Sessions + marketplace sales</p>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'payouts' })} className={metricButtonClass}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payouts paid</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{formatCurrency(payoutsPaidTotal)}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">{formatCurrency(payoutsPendingTotal)} pending/scheduled</p>
              </button>
              <button type="button" onClick={() => setModal({ kind: 'reviews' })} className={metricButtonClass}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Average review</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{reviewsForDisplay.length ? `${averageRating.toFixed(1)} / 5` : '—'}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">{verifiedReviewRate}% verified reviews</p>
              </button>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="glass-card min-w-0 border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Monthly trend</p>
                    <h2 className="mt-2 text-lg font-semibold text-[#191919]">Sessions and revenue</h2>
                  </div>
                </div>
                <div className="mt-5 flex gap-3 overflow-x-auto pb-2 text-[10px] text-[#4a4a4a] sm:grid sm:grid-cols-6 sm:overflow-visible sm:pb-0">
                  {monthlyRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setModal({ kind: 'month', monthKey: row.key })}
                      className="min-w-[88px] shrink-0 rounded-xl border border-[#dcdcdc] p-1 text-center transition hover:border-[#191919] sm:min-w-0"
                    >
                      <div className="mx-auto flex h-28 w-full items-end justify-center gap-1">
                        <div
                          className="w-4 rounded-t bg-[#191919]"
                          style={{ height: `${Math.max(14, (row.sessions / maxMonthlySessions) * 100)}px` }}
                          title={`${row.sessions} sessions`}
                        />
                        <div
                          className="w-4 rounded-t bg-[#b80f0a]"
                          style={{ height: `${Math.max(14, (row.revenue / maxMonthlyRevenue) * 100)}px` }}
                          title={`${formatCurrency(row.revenue)} revenue`}
                        />
                      </div>
                      <p className="mt-2 font-semibold text-[#191919]">{monthLabel(row.key)}</p>
                      <p className="whitespace-nowrap">{row.sessions} sessions</p>
                      <p>{formatCurrency(row.revenue)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Session mix</p>
                <h2 className="mt-2 text-lg font-semibold text-[#191919]">By session type</h2>
                <div className="mt-5 space-y-3 text-sm">
                  {sessionTypeBreakdown.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-xs text-[#4a4a4a]">
                      No session data yet.
                    </p>
                  ) : (
                    sessionTypeBreakdown.map(([type, count]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setModal({ kind: 'sessionType', sessionType: type })}
                        className="flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left transition hover:border-[#191919]"
                      >
                        <span className="font-semibold text-[#191919]">{type}</span>
                        <span className="text-[#4a4a4a]">{count}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete engagement</p>
                <h2 className="mt-2 text-lg font-semibold text-[#191919]">Most active athletes</h2>
                <div className="mt-5 space-y-3 text-sm">
                  {athleteEngagement.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-xs text-[#4a4a4a]">
                      No athlete activity yet.
                    </p>
                  ) : (
                    athleteEngagement.map((athlete) => (
                      <button
                        key={athlete.athleteId}
                        type="button"
                        onClick={() => setModal({ kind: 'athlete', athleteId: athlete.athleteId })}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left transition hover:border-[#191919]"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{athlete.name}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {athlete.completed} completed · last session {dateLabel(athlete.lastDate)}
                          </p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#191919]">
                          {athlete.sessions} sessions
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payout timeline</p>
                <h2 className="mt-2 text-lg font-semibold text-[#191919]">Recent payouts</h2>
                <div className="mt-5 space-y-3 text-sm">
                  {payoutTimeline.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-xs text-[#4a4a4a]">
                      No payouts yet.
                    </p>
                  ) : (
                    payoutTimeline.map((payout) => (
                      <button
                        key={payout.id}
                        type="button"
                        onClick={() => setModal({ kind: 'payout', payoutId: payout.id })}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left transition hover:border-[#191919]"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{formatCurrency(toNumber(payout.amount))}</p>
                          <p className="text-xs text-[#4a4a4a]">{dateLabel(payout.paid_at || payout.scheduled_for || payout.created_at)}</p>
                        </div>
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[11px] font-semibold text-[#191919]">
                          {payout.status || 'scheduled'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Reviews</p>
              <h2 className="mt-2 text-lg font-semibold text-[#191919]">Review quality snapshot</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'reviews', focus: 'total' })}
                  className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-4 text-left transition hover:border-[#191919]"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Total reviews</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{reviewsForDisplay.length}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'reviews', focus: 'average' })}
                  className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-4 text-left transition hover:border-[#191919]"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Average rating</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">
                    {reviewsForDisplay.length ? averageRating.toFixed(1) : '—'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'reviews', focus: 'verified' })}
                  className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-4 text-left transition hover:border-[#191919]"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Verified share</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{verifiedReviewRate}%</p>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {modal && modalContent ? (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24 sm:items-center sm:py-8">
          <div className="max-h-[calc(100dvh-8rem)] w-full max-w-3xl overflow-auto rounded-3xl border border-[#191919] bg-[#f5f5f5] p-6 shadow-xl sm:max-h-[90vh]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Details</p>
                <h3 className="mt-2 text-xl font-semibold text-[#191919]">{modalContent.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close details"
              >
                ×
              </button>
            </div>
            <div className="mt-5">{modalContent.body}</div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="sr-only">Loading reports</div> : null}
    </main>
  )
}
