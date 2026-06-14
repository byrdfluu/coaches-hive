import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin','club_admin','travel_admin','school_admin',
  'athletic_director','program_director','team_manager',
]

async function getOrgId(userId: string) {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { org_id?: string } | null)?.org_id ?? null
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { searchParams } = new URL(request.url)
  const teamId = searchParams.get('team_id')
  const seasonId = searchParams.get('season_id')
  const gameType = searchParams.get('game_type')

  let query = supabaseAdmin
    .from('org_games')
    .select('*')
    .eq('org_id', orgId)
    .order('game_date', { ascending: true })

  if (teamId) query = query.eq('team_id', teamId)
  if (seasonId) query = query.eq('season_id', seasonId)
  if (gameType) query = query.eq('game_type', gameType)

  const { data, error: dbError } = await query
  if (dbError) return jsonError('Failed to fetch games', 500)
  return NextResponse.json({ games: data ?? [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const body = await request.json().catch(() => ({}))
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return jsonError('title is required')

  const { data, error: dbError } = await supabaseAdmin
    .from('org_games')
    .insert({
      org_id: orgId,
      title,
      game_type: body?.game_type || 'game',
      opponent_name: body?.opponent_name?.trim() || null,
      team_id: body?.team_id || null,
      season_id: body?.season_id || null,
      location_id: body?.location_id || null,
      game_date: body?.game_date || null,
      game_time: body?.game_time || null,
      home_away: body?.home_away || 'home',
      notes: body?.notes?.trim() || null,
    })
    .select()
    .single()

  if (dbError) return jsonError('Failed to create game', 500)
  return NextResponse.json({ game: data })
}