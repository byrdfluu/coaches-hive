import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type TrustRow = {
  trustScore: number
  completionRate: number | null
  cancellationRate: number | null
  responseHours: number | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeCoachIds = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^[a-zA-Z0-9-]{6,64}$/.test(value)),
    ),
  ).slice(0, 50)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const coachIds = normalizeCoachIds(searchParams.get('coach_ids') || '')
  if (!coachIds.length) {
    return NextResponse.json({ trust: {} as Record<string, TrustRow> })
  }

  const trust: Record<string, TrustRow> = {}
  const now = Date.now()
  const sessionsSinceIso = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString()
  const messagesSinceIso = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: reviewRows }, { data: sessionRows }, { data: participantRows }] = await Promise.all([
    supabaseAdmin
      .from('coach_reviews')
      .select('coach_id, rating, verified')
      .in('coach_id', coachIds)
      .eq('status', 'approved')
      .limit(5000),
    supabaseAdmin
      .from('sessions')
      .select('coach_id, start_time, status, attendance_status')
      .in('coach_id', coachIds)
      .gte('start_time', sessionsSinceIso)
      .limit(20000),
    supabaseAdmin
      .from('thread_participants')
      .select('thread_id, user_id')
      .in('user_id', coachIds)
      .limit(20000),
  ])

  const reviewByCoach = new Map<string, { sum: number; count: number; verified: number }>()
  ;(reviewRows || []).forEach((row) => {
    if (!row.coach_id) return
    const current = reviewByCoach.get(row.coach_id) || { sum: 0, count: 0, verified: 0 }
    current.sum += Number(row.rating || 0)
    current.count += 1
    if (row.verified) current.verified += 1
    reviewByCoach.set(row.coach_id, current)
  })

  const sessionByCoach = new Map<string, { past: number; canceled: number }>()
  ;(sessionRows || []).forEach((row) => {
    if (!row.coach_id) return
    const start = row.start_time ? new Date(row.start_time).getTime() : Number.NaN
    if (!Number.isFinite(start) || start > now) return

    const status = String(row.status || '').trim().toLowerCase()
    const attendance = String(row.attendance_status || '').trim().toLowerCase()
    const canceled =
      status.includes('cancel')
      || status === 'no_show'
      || attendance === 'absent'
      || attendance === 'no_show'
      || attendance.includes('cancel')

    const current = sessionByCoach.get(row.coach_id) || { past: 0, canceled: 0 }
    current.past += 1
    if (canceled) current.canceled += 1
    sessionByCoach.set(row.coach_id, current)
  })

  const threadToCoaches = new Map<string, string[]>()
  ;(participantRows || []).forEach((row) => {
    if (!row.thread_id || !row.user_id) return
    const current = threadToCoaches.get(row.thread_id) || []
    current.push(row.user_id)
    threadToCoaches.set(row.thread_id, current)
  })

  const threadIds = Array.from(threadToCoaches.keys()).slice(0, 1000)
  const responseHoursByCoach = new Map<string, number | null>()

  if (threadIds.length) {
    const { data: messageRows } = await supabaseAdmin
      .from('messages')
      .select('thread_id, sender_id, created_at')
      .in('thread_id', threadIds)
      .gte('created_at', messagesSinceIso)
      .order('created_at', { ascending: true })
      .limit(20000)

    const pendingByThreadCoach = new Map<string, string>()
    const samplesByCoach = new Map<string, number[]>()

    ;(messageRows || []).forEach((row) => {
      if (!row.thread_id || !row.sender_id || !row.created_at) return
      const coaches = threadToCoaches.get(row.thread_id) || []
      const messageTime = new Date(row.created_at).getTime()
      if (!Number.isFinite(messageTime)) return

      coaches.forEach((coachId) => {
        const pendingKey = `${row.thread_id}:${coachId}`
        if (row.sender_id === coachId) {
          const incomingAt = pendingByThreadCoach.get(pendingKey)
          if (!incomingAt) return
          pendingByThreadCoach.delete(pendingKey)
          const incomingTime = new Date(incomingAt).getTime()
          if (!Number.isFinite(incomingTime)) return
          const diffHours = (messageTime - incomingTime) / (60 * 60 * 1000)
          if (diffHours < 0 || diffHours > 72) return
          const currentSamples = samplesByCoach.get(coachId) || []
          currentSamples.push(diffHours)
          samplesByCoach.set(coachId, currentSamples)
          return
        }

        if (!pendingByThreadCoach.has(pendingKey)) {
          pendingByThreadCoach.set(pendingKey, row.created_at)
        }
      })
    })

    samplesByCoach.forEach((samples, coachId) => {
      if (!samples.length) {
        responseHoursByCoach.set(coachId, null)
        return
      }
      const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length
      responseHoursByCoach.set(coachId, Math.round(avg * 10) / 10)
    })
  }

  coachIds.forEach((coachId) => {
    const review = reviewByCoach.get(coachId)
    const session = sessionByCoach.get(coachId)
    const responseHours = responseHoursByCoach.get(coachId) ?? null

    const hasReview = Boolean(review && review.count > 0)
    const hasSession = Boolean(session && session.past > 0)
    const hasResponse = responseHours !== null
    if (!hasReview && !hasSession && !hasResponse) return

    const avgRating = hasReview ? (review!.sum / review!.count) : null
    const completionRate = hasSession ? (session!.past - session!.canceled) / session!.past : null
    const cancellationRate = hasSession ? session!.canceled / session!.past : null

    const ratingScore = hasReview ? (avgRating! / 5) * 35 : 0
    const reviewVolumeScore = hasReview ? (Math.min(review!.count, 25) / 25) * 10 : 0
    const completionScore = completionRate !== null ? completionRate * 10 : 0
    const responseScore = responseHours !== null ? clamp(8 - (Math.min(responseHours, 24) / 24) * 8, 0, 8) : 0
    const cancellationPenalty = cancellationRate !== null ? cancellationRate * 8 : 0

    const trustScore = Math.round(
      clamp(40 + ratingScore + reviewVolumeScore + completionScore + responseScore - cancellationPenalty, 1, 99),
    )

    trust[coachId] = {
      trustScore,
      completionRate: completionRate === null ? null : Math.round(completionRate * 1000) / 1000,
      cancellationRate: cancellationRate === null ? null : Math.round(cancellationRate * 1000) / 1000,
      responseHours,
    }
  })

  return NextResponse.json({ trust })
}
