import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


type AvailabilityRow = {
  day_of_week: number
  start_time?: string | null
  end_time?: string | null
  session_type?: string | null
}

type SessionRow = {
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
}

const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map((value) => Number.parseInt(value, 10))
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

const getSessionEnd = (session: SessionRow, fallbackDuration: number) => {
  if (!session.start_time) return null
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return null
  if (session.end_time) {
    const end = new Date(session.end_time)
    return Number.isNaN(end.getTime()) ? null : end
  }
  const duration = session.duration_minutes || fallbackDuration
  return new Date(start.getTime() + duration * 60 * 1000)
}

const timeOfDayRanges: Record<string, { start: number; end: number }> = {
  morning: { start: 5 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 22 * 60 },
}

const isWithinTimeOfDay = (minutes: number, label: string) => {
  if (label === 'all') return true
  const range = timeOfDayRanges[label]
  if (!range) return true
  return minutes >= range.start && minutes < range.end
}

export async function GET(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (error || !session) return error

  const url = new URL(request.url)
  const coachId = url.searchParams.get('coach_id') || (role === 'coach' ? session.user.id : null)
  if (!coachId) {
    return jsonError('coach_id is required', 400)
  }

  const durationParam = Number.parseInt(url.searchParams.get('duration_minutes') || '60', 10)
  const duration = Number.isFinite(durationParam) && durationParam > 0 ? durationParam : 60
  const daysParam = Number.parseInt(url.searchParams.get('days') || '14', 10)
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 60) : 14
  const maxParam = Number.parseInt(url.searchParams.get('max') || '6', 10)
  const maxResults = Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, 20) : 6
  const timeOfDay = (url.searchParams.get('time_of_day') || 'all').toLowerCase()

  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + days)

  const { data: availabilityRows, error: availabilityError } = await supabaseAdmin
    .from('availability_blocks')
    .select('day_of_week, start_time, end_time, session_type')
    .eq('coach_id', coachId)

  if (availabilityError) {
    return jsonError(availabilityError.message, 500)
  }

  const { data: sessions, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .select('start_time, end_time, duration_minutes')
    .eq('coach_id', coachId)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())

  if (sessionError) {
    return jsonError(sessionError.message, 500)
  }

  const availability = (availabilityRows || []) as AvailabilityRow[]
  const booked = (sessions || []) as SessionRow[]
  const now = new Date()
  const suggestions: Array<{ start_time: string; end_time: string }> = []
  const increment = 30

  for (let offset = 0; offset < days; offset += 1) {
    if (suggestions.length >= maxResults) break
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + offset)
    const dayOfWeek = day.getDay()
    const blocks = availability.filter((block) => block.day_of_week === dayOfWeek)
    if (blocks.length === 0) continue

    for (const block of blocks) {
      if (suggestions.length >= maxResults) break
      if (!block.start_time || !block.end_time) continue
      const blockStart = toMinutes(block.start_time)
      const blockEnd = toMinutes(block.end_time)
      if (blockStart === null || blockEnd === null) continue

      for (let minute = blockStart; minute + duration <= blockEnd; minute += increment) {
        if (suggestions.length >= maxResults) break
        if (!isWithinTimeOfDay(minute, timeOfDay)) continue

        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minute / 60), minute % 60)
        if (start <= now) continue
        const end = new Date(start.getTime() + duration * 60 * 1000)

        const conflicts = booked.some((session) => {
          if (!session.start_time) return false
          const sessionStart = new Date(session.start_time)
          const sessionEnd = getSessionEnd(session, duration)
          if (Number.isNaN(sessionStart.getTime()) || !sessionEnd) return false
          return start < sessionEnd && end > sessionStart
        })

        if (conflicts) continue

        suggestions.push({
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        })
      }
    }
  }

  return NextResponse.json({
    coach_id: coachId,
    duration_minutes: duration,
    time_of_day: timeOfDay,
    window: { start_date: startDate.toISOString(), end_date: endDate.toISOString() },
    suggestions,
  })
}
