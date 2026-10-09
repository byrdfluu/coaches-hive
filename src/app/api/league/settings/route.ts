import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { leagueCan, requireLeagueMembership } from '@/lib/leagueAuthority'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

async function authorityFor(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { authority: null, error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const authority = await requireLeagueMembership(session.user.id, request.headers.get('x-workspace-id'))
  if (!authority) return { authority: null, error: NextResponse.json({ error: 'Your league access is no longer active.' }, { status: 403 }) }
  return { authority, error: null }
}

export async function GET(request: Request) {
  const { authority, error } = await authorityFor(request)
  if (error || !authority) return error
  const [rules, notifications, competition] = await Promise.all([
    supabaseAdmin.from('league_registration_rules').select('*').eq('league_id', authority.league_id).maybeSingle(),
    supabaseAdmin.from('league_notification_preferences').select('*').eq('league_id', authority.league_id).maybeSingle(),
    supabaseAdmin.from('league_competition_settings').select('*').eq('league_id', authority.league_id).maybeSingle(),
  ])
  if (rules.error || notifications.error || competition.error) return NextResponse.json({ error: 'Unable to load league settings.' }, { status: 500 })
  return NextResponse.json({ league_id: authority.league_id, can_manage: leagueCan(authority, 'manage_registrations'), rules: rules.data, notifications: notifications.data, competition: competition.data }, { headers: noStore })
}

const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
const integer = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export async function PUT(request: Request) {
  const { authority, error } = await authorityFor(request)
  if (error || !authority) return error
  if (!leagueCan(authority, 'manage_registrations')) return NextResponse.json({ error: 'You do not have permission to manage league settings.' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Settings are required.' }, { status: 400 })
  const leagueId = authority.league_id
  const rules = {
    league_id: leagueId,
    minimum_age: body.rules?.minimum_age === null || body.rules?.minimum_age === '' ? null : integer(body.rules?.minimum_age, 0, 0, 100),
    maximum_age: body.rules?.maximum_age === null || body.rules?.maximum_age === '' ? null : integer(body.rules?.maximum_age, 100, 0, 100),
    eligible_grades: Array.isArray(body.rules?.eligible_grades) ? body.rules.eligible_grades.map(String).map((v: string) => v.trim()).filter(Boolean).slice(0, 30) : [],
    registration_open: bool(body.rules?.registration_open, true), approval_required: bool(body.rules?.approval_required, true), waitlist_enabled: bool(body.rules?.waitlist_enabled, true),
  }
  if (rules.minimum_age !== null && rules.maximum_age !== null && rules.minimum_age > rules.maximum_age) return NextResponse.json({ error: 'Minimum age cannot exceed maximum age.' }, { status: 400 })
  const notifications = {
    league_id: leagueId,
    join_requests: bool(body.notifications?.join_requests, true), registrations: bool(body.notifications?.registrations, true), payments: bool(body.notifications?.payments, true), documents: bool(body.notifications?.documents, true),
    schedule_changes: bool(body.notifications?.schedule_changes, true), game_results: bool(body.notifications?.game_results, true), messages: bool(body.notifications?.messages, true), weekly_digest: bool(body.notifications?.weekly_digest, true),
  }
  const competition = {
    league_id: leagueId,
    event_label: String(body.competition?.event_label || 'Game').trim().slice(0, 60) || 'Game', period_label: String(body.competition?.period_label || 'Half').trim().slice(0, 60) || 'Half',
    period_count: integer(body.competition?.period_count, 2, 1, 12), period_minutes: integer(body.competition?.period_minutes, 45, 1, 180),
    ties_allowed: bool(body.competition?.ties_allowed, true), overtime_allowed: bool(body.competition?.overtime_allowed, false),
    win_points: integer(body.competition?.win_points, 3, 0, 10), tie_points: integer(body.competition?.tie_points, 1, 0, 10), loss_points: integer(body.competition?.loss_points, 0, 0, 10),
    tiebreakers: Array.isArray(body.competition?.tiebreakers) ? body.competition.tiebreakers.map(String).map((v: string) => v.trim()).filter(Boolean).slice(0, 20) : [],
    forfeit_home_score: integer(body.competition?.forfeit_home_score, 3, 0, 100), forfeit_away_score: integer(body.competition?.forfeit_away_score, 0, 0, 100),
  }
  const results = await Promise.all([
    supabaseAdmin.from('league_registration_rules').upsert(rules, { onConflict: 'league_id' }),
    supabaseAdmin.from('league_notification_preferences').upsert(notifications, { onConflict: 'league_id' }),
    supabaseAdmin.from('league_competition_settings').upsert(competition, { onConflict: 'league_id' }),
  ])
  if (results.some((result) => result.error)) return NextResponse.json({ error: 'Unable to save all league settings.' }, { status: 500 })
  return NextResponse.json({ ok: true, rules, notifications, competition }, { headers: noStore })
}
