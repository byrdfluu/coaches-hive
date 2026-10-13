import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { leagueCan, requireLeagueMembership } from '@/lib/leagueAuthority'

export const dynamic = 'force-dynamic'
const db = supabaseAdmin as any
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const authority = await requireLeagueMembership(session.user.id, request.headers.get('x-workspace-id'))
  if (!authority || (!leagueCan(authority, 'view_reports') && !leagueCan(authority, 'manage_registrations'))) return NextResponse.json({ error: 'You do not have permission to view league reports.' }, { status: 403 })
  const url = new URL(request.url), seasonId = url.searchParams.get('season_id'), competitionId = url.searchParams.get('competition_id'), divisionId = url.searchParams.get('division_id'), organizationId = url.searchParams.get('organization_id'), teamId = url.searchParams.get('team_id')
  let registrationsQuery = db.from('league_registrations').select('*').eq('league_id', authority.league_id)
  if (seasonId) registrationsQuery = registrationsQuery.eq('season_id', seasonId)
  if (competitionId) registrationsQuery = registrationsQuery.eq('competition_id', competitionId)
  if (divisionId) registrationsQuery = registrationsQuery.eq('division_id', divisionId)
  if (organizationId) registrationsQuery = registrationsQuery.eq('org_id', organizationId)
  if (teamId) registrationsQuery = registrationsQuery.eq('team_id', teamId)
  let assignmentsQuery = db.from('league_team_assignments').select('*').eq('league_id', authority.league_id)
  if (seasonId) assignmentsQuery = assignmentsQuery.eq('season_id', seasonId)
  if (divisionId) assignmentsQuery = assignmentsQuery.eq('division_id', divisionId)
  if (organizationId) assignmentsQuery = assignmentsQuery.eq('org_id', organizationId)
  if (teamId) assignmentsQuery = assignmentsQuery.eq('team_id', teamId)
  let gamesQuery = db.from('league_games').select('status,result_status,result_type,home_team_id,away_team_id').eq('league_id', authority.league_id)
  if (seasonId) gamesQuery = gamesQuery.eq('season_id', seasonId)
  if (competitionId) gamesQuery = gamesQuery.eq('competition_id', competitionId)
  if (divisionId) gamesQuery = gamesQuery.eq('division_id', divisionId)
  const [{ data: registrations }, { data: assignments }, { data: fees }, { data: documents }, { data: games }, { data: seasons }, { data: competitions }, { data: divisions }, { data: leagueOrganizations }] = await Promise.all([
    registrationsQuery,
    assignmentsQuery,
    db.from('league_fee_assignments').select('*').eq('league_id', authority.league_id),
    db.from('league_document_submissions').select('status').eq('league_id', authority.league_id),
    gamesQuery,
    db.from('league_seasons').select('id,name').eq('league_id', authority.league_id).order('start_date', { ascending: false }),
    db.from('league_competitions').select('id,name,season_id').eq('league_id', authority.league_id).order('name'),
    db.from('league_divisions').select('id,name,season_id,competition_id').eq('league_id', authority.league_id).order('name'),
    db.from('league_organizations').select('org_id').eq('league_id', authority.league_id).eq('status', 'active'),
  ])
  const rows = registrations || [], registrationIdSet = new Set(rows.map((row:any)=>row.id))
  const feeRows = (fees || []).filter((row:any)=>!seasonId&&!competitionId&&!divisionId&&!organizationId&&!teamId || registrationIdSet.has(row.registration_id))
  const teamRows = assignments || [], gameRows = (games || []).filter((row:any)=>!teamId||row.home_team_id===teamId||row.away_team_id===teamId)
  const registrationIds = rows.map((row:any)=>row.id)
  const { data: redemptions } = registrationIds.length
    ? await db.from('league_discount_redemptions').select('registration_id,discount_amount_cents').in('registration_id', registrationIds)
    : { data: [] }
  const orgIds = (leagueOrganizations || []).map((row:any)=>row.org_id)
  const [{ data: organizations }, { data: teams }] = await Promise.all([
    orgIds.length ? db.from('org_settings').select('org_id,org_name').in('org_id', orgIds) : Promise.resolve({ data: [] }),
    orgIds.length ? db.from('org_teams').select('id,org_id,name').in('org_id', orgIds).order('name') : Promise.resolve({ data: [] }),
  ])
  const metrics = {
    registered_athletes: new Set(rows.map((row:any)=>row.athlete_id).filter(Boolean)).size,
    approved_teams: teamRows.filter((row:any)=>row.participation_status==='approved').length,
    provisional_teams: teamRows.filter((row:any)=>row.participation_status==='provisional').length,
    waitlisted_teams: teamRows.filter((row:any)=>row.participation_status==='waitlisted').length,
    free_agents: rows.filter((row:any)=>row.registration_type==='free_agent'&&!row.team_id).length,
    registrations: rows.length,
    approved_registrations: rows.filter((row:any)=>['approved','eligible','registered'].includes(row.status)).length,
    revenue_collected_cents: feeRows.reduce((sum:number,row:any)=>sum+Number(row.paid_cents||0),0),
    outstanding_cents: feeRows.reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.amount_cents||0)-Number(row.paid_cents||0)-Number(row.refunded_cents||0)),0),
    discounts_cents: (redemptions||[]).reduce((sum:number,row:any)=>sum+Number(row.discount_amount_cents||0),0),
    roster_completion_percent: teamRows.length?Math.round(teamRows.filter((row:any)=>['submitted','registered','approved'].includes(row.participation_status)).length/teamRows.length*100):0,
    eligibility_completion_percent: rows.length?Math.round(rows.filter((row:any)=>row.eligibility_status==='eligible').length/rows.length*100):0,
    document_completion_percent: (documents||[]).length?Math.round((documents||[]).filter((row:any)=>row.status==='approved').length/(documents||[]).length*100):0,
    games_scheduled: gameRows.length,
    games_completed: gameRows.filter((row:any)=>row.status==='final'&&row.result_status==='final').length,
    forfeits: gameRows.filter((row:any)=>String(row.result_type||'').includes('forfeit')).length,
  }
  if (url.searchParams.get('format') === 'csv') {
    const lines = [['Metric','Value'], ...Object.entries(metrics).map(([key,value])=>[key.replaceAll('_',' '),value])].map(row=>row.map(csv).join(','))
    return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="league-report.csv"' } })
  }
  return NextResponse.json({ metrics, filters: { seasons: seasons||[], competitions: competitions||[], divisions: divisions||[], organizations: organizations||[], teams: teams||[] } }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
