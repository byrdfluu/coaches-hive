import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('org_id')
  const teamId = searchParams.get('team_id')

  // Verify the coach belongs to the org being requested
  const { data: memberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)

  const coachOrgIds = ((memberships || []) as { org_id: string }[]).map((r) => r.org_id)
  if (!coachOrgIds.length) return NextResponse.json({ games: [] })

  const today = new Date().toISOString().slice(0, 10)

  let query = supabaseAdmin
    .from('org_games')
    .select('id, org_id, team_id, title, game_type, opponent_name, game_date, game_time, home_away, score_us, score_them, result, notes')
    .in('org_id', coachOrgIds)
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .limit(20)

  if (orgId && coachOrgIds.includes(orgId)) {
    query = query.eq('org_id', orgId)
  }
  if (teamId) {
    query = query.eq('team_id', teamId)
  }

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ games: [] })

  return NextResponse.json({ games: data ?? [] })
}
