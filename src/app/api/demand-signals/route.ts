import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const MAX_SIGNALS = 12
const MAX_SIGNAL_LENGTH = 80
const DEFAULT_LIMIT = 6
const DEFAULT_WINDOW_DAYS = 30

const normalizeSignal = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_SIGNAL_LENGTH)

const formatSignalLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return trimmed[0].toUpperCase() + trimmed.slice(1)
}

const parseLimit = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isNaN(parsed)) return DEFAULT_LIMIT
  return Math.min(Math.max(parsed, 1), 12)
}

const parseWindowDays = (value: string | null) => {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isNaN(parsed)) return DEFAULT_WINDOW_DAYS
  return Math.min(Math.max(parsed, 1), 90)
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole([
    'coach',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const url = new URL(request.url)
  const limit = parseLimit(url.searchParams.get('limit'))
  const windowDays = parseWindowDays(url.searchParams.get('window_days'))
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error: queryError } = await supabaseAdmin
    .from('demand_signal_events')
    .select('signal, event_type, created_at')
    .gte('created_at', since)

  if (queryError) {
    return jsonError(queryError.message, 500)
  }

  const weightByEvent: Record<string, number> = {
    search_filters: 1,
    profile_view: 2,
    booking_intent: 5,
    coach_request: 5,
  }

  const buckets = new Map<string, { score: number; label: string }>()
  ;(data || []).forEach((row) => {
    const signal = normalizeSignal(String(row.signal || ''))
    if (!signal) return
    const weight = weightByEvent[String(row.event_type || '')] || 1
    const entry = buckets.get(signal) || { score: 0, label: signal }
    entry.score += weight
    buckets.set(signal, entry)
  })

  const signals = Array.from(buckets.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([signal, entry]) => ({
      label: formatSignalLabel(entry.label || signal),
      score: entry.score,
    }))

  return NextResponse.json({ signals })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const rawSignals = Array.isArray(body?.signals) ? body.signals : []
  const eventType = typeof body?.event_type === 'string' && body.event_type.trim()
    ? body.event_type.trim().toLowerCase()
    : 'search_filters'
  const metadata = typeof body?.metadata === 'object' && body.metadata !== null ? body.metadata : null

  const uniqueSignals = Array.from(
    new Set(
      rawSignals
        .filter((signal: unknown) => typeof signal === 'string')
        .map((signal: string) => normalizeSignal(signal))
        .filter(Boolean)
    )
  ).slice(0, MAX_SIGNALS)

  if (uniqueSignals.length === 0) {
    return jsonError('signals are required', 400)
  }

  // Per-user rate limit: max 30 signal events per 60 seconds
  const rateLimitWindow = new Date(Date.now() - 60_000).toISOString()
  const { count: recentCount } = await supabaseAdmin
    .from('demand_signal_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .gte('created_at', rateLimitWindow)

  if ((recentCount || 0) >= 30) {
    return jsonError('Rate limit exceeded. Try again shortly.', 429)
  }

  const rows = uniqueSignals.map((signal) => ({
    user_id: session.user.id,
    role: getSessionRoleState(session.user.user_metadata).currentRole,
    event_type: eventType,
    signal,
    metadata,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('demand_signal_events')
    .insert(rows)

  if (insertError) {
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ ok: true })
}
