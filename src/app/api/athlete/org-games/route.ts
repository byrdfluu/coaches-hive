import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const userId = session.user.id
  const today = new Date().toISOString().slice(0, 10)

  // Get athlete's team memberships and org memberships in parallel
  const [teamMembershipsRes, orgMembershipsRes] = await Promise.all([
    supabaseAdmin
      .from('org_team_members')
      .select('team_id')
      .eq('athlete_id', userId),
    supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId),
  ])

  const teamIds = ((teamMembershipsRes.data || []) as { team_id: string }[]).map((r) => r.team_id)
  const orgIds = ((orgMembershipsRes.data || []) as { org_id: string }[]).map((r) => r.org_id)

  if (!teamIds.length && !orgIds.length) {
    return NextResponse.json({ games: [] })
  }

  // Fetch upcoming games for athlete's teams or their orgs
  let query = supabaseAdmin
    .from('org_games')
    .select('id, org_id, team_id, title, game_type, opponent_name, game_date, game_time, home_away, score_us, score_them, result, notes, location_id')
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .limit(30)

  if (teamIds.length && orgIds.length) {
    query = query.or(`team_id.in.(${teamIds.join(',')}),org_id.in.(${orgIds.join(',')})`)
  } else if (teamIds.length) {
    query = query.in('team_id', teamIds)
  } else {
    query = query.in('org_id', orgIds)
  }

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ games: [] })

  return NextResponse.json({ games: data ?? [] })
}
