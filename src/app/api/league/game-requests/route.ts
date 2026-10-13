import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { leagueCan, requireLeagueMembership } from '@/lib/leagueAuthority'

export const dynamic = 'force-dynamic'

async function authorize(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const authority = await requireLeagueMembership(session.user.id, request.headers.get('x-workspace-id'))
  if (!authority || !leagueCan(authority, 'manage_schedule')) return { error: NextResponse.json({ error: 'League schedule permission is required.' }, { status: 403 }) }
  return { supabase, authority }
}

export async function GET(request: Request) {
  const access = await authorize(request); if ('error' in access) return access.error
  const { data, error } = await (supabaseAdmin as any).from('league_game_requests')
    .select('id,game_id,request_type,reason,proposed_starts_at,status,created_at,reviewed_at,league_games(starts_at,home_team_id,away_team_id,home_team:org_teams!league_games_home_team_id_fkey(name),away_team:org_teams!league_games_away_team_id_fkey(name)),requester:profiles!league_game_requests_requested_by_fkey(full_name)')
    .eq('league_id', access.authority.league_id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load the game review queue.' }, { status: 500 })
  return NextResponse.json({ requests: data || [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function PUT(request: Request) {
  const access = await authorize(request); if ('error' in access) return access.error
  const body = await request.json().catch(() => ({})), decision = String(body?.decision || '')
  if (!['approved','declined'].includes(decision)) return NextResponse.json({ error: 'Choose approve or decline.' }, { status: 400 })
  const { error } = await (access.supabase as any).rpc('review_league_game_request', { p_request_id: String(body?.request_id || ''), p_decision: decision, p_note: String(body?.note || '') || null })
  if (error) return NextResponse.json({ error: String(error.message || 'Unable to review request.') }, { status: 409 })
  return NextResponse.json({ ok: true })
}
