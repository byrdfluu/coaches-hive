import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { COACH_AVAILABILITY_RULES_ALLOWED, normalizeCoachTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'

type AvailabilityPayload = {
  day_of_week?: number
  start_time?: string
  end_time?: string
  specific_date?: string | null
  session_type?: string | null
  location?: string | null
  timezone?: string
}

type NormalizedAvailabilityPayload = {
  resolvedDay: number
  resolvedDate: string | null
  start_time: string
  end_time: string
  session_type: string | null
  location: string | null
  timezone: string
  newStart: number
  newEnd: number
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map((part) => Number.parseInt(part, 10))
  return Number.isNaN(hour) || Number.isNaN(minute) ? null : hour * 60 + minute
}

function normalizeAvailabilityPayload(body: AvailabilityPayload) {
  const {
    day_of_week,
    start_time,
    end_time,
    specific_date,
    session_type,
    location,
    timezone = 'UTC',
  } = body || {}

  if (start_time === undefined || end_time === undefined) {
    return { error: jsonError('start_time and end_time are required') }
  }

  let resolvedDay = day_of_week
  let resolvedDate: string | null = null
  if (specific_date) {
    const parsedDate = new Date(`${specific_date}T00:00:00`)
    if (Number.isNaN(parsedDate.getTime())) {
      return { error: jsonError('specific_date must be a valid YYYY-MM-DD') }
    }
    resolvedDay = parsedDate.getDay()
    resolvedDate = String(specific_date)
  }

  if (resolvedDay === undefined) {
    return { error: jsonError('day_of_week or specific_date is required') }
  }

  const newStart = toMinutes(start_time)
  const newEnd = toMinutes(end_time)

  if (newStart === null || newEnd === null || newStart >= newEnd) {
    return { error: jsonError('start_time must be before end_time') }
  }

  return {
    payload: {
      resolvedDay,
      resolvedDate,
      start_time,
      end_time,
      session_type: session_type ? String(session_type) : null,
      location: location ? String(location) : null,
      timezone: String(timezone || 'UTC'),
      newStart,
      newEnd,
    } satisfies NormalizedAvailabilityPayload,
  }
}

async function hasAvailabilityOverlap(
  coachId: string,
  payload: NormalizedAvailabilityPayload,
  excludeId?: string,
) {
  const { data: existingBlocks, error } = await supabaseAdmin
    .from('availability_blocks')
    .select('id, start_time, end_time, specific_date')
    .eq('coach_id', coachId)
    .eq('day_of_week', payload.resolvedDay)

  if (error) {
    return { error }
  }

  const hasOverlap = (existingBlocks || []).some((block) => {
    if (excludeId && block.id === excludeId) return false
    if (payload.resolvedDate && block.specific_date && block.specific_date !== payload.resolvedDate) return false
    const existStart = toMinutes(block.start_time)
    const existEnd = toMinutes(block.end_time)
    if (existStart === null || existEnd === null) return false
    return payload.newStart < existEnd && payload.newEnd > existStart
  })

  return { hasOverlap }
}

async function requireCoachPlan(coachId: string) {
  const { data: planRow } = await supabaseAdmin
    .from('coach_plans')
    .select('tier')
    .eq('coach_id', coachId)
    .maybeSingle()
  const tier = normalizeCoachTier(planRow?.tier)
  if (!COACH_AVAILABILITY_RULES_ALLOWED[tier]) {
    return jsonError('Availability rules require a Pro or Elite plan.', 403)
  }
  return null
}

export async function GET(request: Request) {
  const { session, role, error: authError } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (authError || !session) return authError

  const url = new URL(request.url)
  const coachId = url.searchParams.get('coach_id') || session.user.id

  if (role === 'athlete' && !url.searchParams.get('coach_id')) {
    return jsonError('coach_id is required for athlete requests', 400)
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('availability_blocks')
    .select('*')
    .eq('coach_id', coachId)
    .order('day_of_week', { ascending: true })

  if (dbError) {
    return jsonError(dbError.message, 500)
  }

  return NextResponse.json({ availability: data || [] })
}

export async function POST(request: Request) {
  const { session, role, error: authError } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (authError || !session) return authError

  if (role !== 'coach') {
    return jsonError('Only coaches can manage availability', 403)
  }

  const planError = await requireCoachPlan(session.user.id)
  if (planError) return planError

  const body = await request.json().catch(() => ({}))
  const normalized = normalizeAvailabilityPayload(body)
  if ('error' in normalized) return normalized.error

  const overlapCheck = await hasAvailabilityOverlap(session.user.id, normalized.payload)
  if (overlapCheck.error) {
    return jsonError(overlapCheck.error.message, 500)
  }
  if (overlapCheck.hasOverlap) {
    return jsonError('This time block overlaps with an existing availability window.', 409)
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('availability_blocks')
    .insert({
      coach_id: session.user.id,
      day_of_week: normalized.payload.resolvedDay,
      specific_date: normalized.payload.resolvedDate,
      start_time: normalized.payload.start_time,
      end_time: normalized.payload.end_time,
      session_type: normalized.payload.session_type,
      location: normalized.payload.location,
      timezone: normalized.payload.timezone,
    })
    .select('*')
    .single()

  if (dbError) {
    return jsonError(dbError.message, 500)
  }

  return NextResponse.json({ availability: data })
}

export async function PATCH(request: Request) {
  const { session, role, error: authError } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (authError || !session) return authError

  if (role !== 'coach') {
    return jsonError('Only coaches can manage availability', 403)
  }

  const planError = await requireCoachPlan(session.user.id)
  if (planError) return planError

  const body = await request.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) {
    return jsonError('id is required')
  }

  const { data: record, error: recordError } = await supabaseAdmin
    .from('availability_blocks')
    .select('id, coach_id')
    .eq('id', id)
    .maybeSingle()

  if (recordError) {
    return jsonError(recordError.message, 500)
  }

  if (!record || record.coach_id !== session.user.id) {
    return jsonError('Not found', 404)
  }

  const normalized = normalizeAvailabilityPayload(body)
  if ('error' in normalized) return normalized.error

  const overlapCheck = await hasAvailabilityOverlap(session.user.id, normalized.payload, id)
  if (overlapCheck.error) {
    return jsonError(overlapCheck.error.message, 500)
  }
  if (overlapCheck.hasOverlap) {
    return jsonError('This time block overlaps with an existing availability window.', 409)
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('availability_blocks')
    .update({
      day_of_week: normalized.payload.resolvedDay,
      specific_date: normalized.payload.resolvedDate,
      start_time: normalized.payload.start_time,
      end_time: normalized.payload.end_time,
      session_type: normalized.payload.session_type,
      location: normalized.payload.location,
      timezone: normalized.payload.timezone,
    })
    .eq('id', id)
    .eq('coach_id', session.user.id)
    .select('*')
    .single()

  if (dbError) {
    return jsonError(dbError.message, 500)
  }

  return NextResponse.json({ availability: data })
}

export async function DELETE(request: Request) {
  const { session, role, error: authError } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (authError || !session) return authError

  if (role !== 'coach') {
    return jsonError('Only coaches can manage availability', 403)
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return jsonError('id is required')
  }

  const { data: record } = await supabaseAdmin
    .from('availability_blocks')
    .select('id, coach_id')
    .eq('id', id)
    .maybeSingle()

  if (!record || record.coach_id !== session.user.id) {
    return jsonError('Not found', 404)
  }

  const { error: dbError } = await supabaseAdmin
    .from('availability_blocks')
    .delete()
    .eq('id', id)

  if (dbError) {
    return jsonError(dbError.message, 500)
  }

  return NextResponse.json({ ok: true })
}
