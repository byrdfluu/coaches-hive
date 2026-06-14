import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['guardian', 'admin'])
  if (error || !session) return error

  const userId = session.user.id
  const today = new Date().toISOString().slice(0, 10)

  // Get linked athlete IDs
  const { data: links } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('athlete_id')
    .eq('guardian_user_id', userId)
    .eq('status', 'active')

  const athleteIds = ((links || []) as { athlete_id: string }[]).map((r) => r.athlete_id)
  if (!athleteIds.length) return NextResponse.json({ games: [] })

  // Get their team memberships and org memberships in parallel
  const [teamRes, orgRes] = await Promise.all([
    supabaseAdmin
      .from('org_team_members')
      .select('team_id, athlete_id')
      .in('athlete_id', athleteIds),
    supabaseAdmin
      .from('organization_memberships')
      .select('org_id, user_id')
      .in('user_id', athleteIds),
  ])

  const teamIds = ((teamRes.data || []) as { team_id: string; athlete_id: string }[]).map((r) => r.team_id)
  const orgIds = ((orgRes.data || []) as { org_id: string; user_id: string }[]).map((r) => r.org_id)

  if (!teamIds.length && !orgIds.length) return NextResponse.json({ games: [] })

  let query = supabaseAdmin
    .from('org_games')
    .select('id, org_id, team_id, title, game_type, opponent_name, game_date, game_time, home_away, score_us, score_them, result')
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .limit(20)

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
