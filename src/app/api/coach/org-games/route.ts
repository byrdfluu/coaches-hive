import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const userId = session.user.id
  const { searchParams } = new URL(request.url)
  const requestedOrgId = searchParams.get('org_id')
  const requestedTeamId = searchParams.get('team_id')
  const context = await resolveActiveCoachContext(userId)
  if (!context.organizationId) return NextResponse.json({ games: [] })
  if (requestedOrgId && requestedOrgId !== context.organizationId) {
    return NextResponse.json({ error: 'That organization is not the active coach workspace.' }, { status: 403 })
  }
  if (requestedTeamId && context.teamId && requestedTeamId !== context.teamId) {
    return NextResponse.json({ error: 'That team is not the active coach profile.' }, { status: 403 })
  }

  const today = new Date().toISOString().slice(0, 10)

  let query = supabaseAdmin
    .from('org_games')
    .select('id, org_id, team_id, title, game_type, opponent_name, game_date, game_time, home_away, score_us, score_them, result, notes')
    .eq('org_id', context.organizationId)
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .limit(20)

  const teamId = context.teamId || requestedTeamId
  if (teamId) query = query.eq('team_id', teamId)

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ games: [] })

  return NextResponse.json({ games: data ?? [] })
}
