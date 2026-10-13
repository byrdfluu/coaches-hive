import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'

export const dynamic = 'force-dynamic'

type Scope = {
  kind: 'organization' | 'coach' | 'family'
  organizationIds: string[]
  teamIds: string[]
  athleteIds: string[]
}

const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean) as string[]))
const db = supabaseAdmin as any

async function resolveScope(request: Request, userId: string, requestedAthleteId?: string | null): Promise<Scope | null> {
  const workspace = await requireWorkspaceContext(userId, request.headers.get('x-workspace-id'))
  if (workspace?.type === 'organization' && workspace.organizationId) {
    const organizationIds = [workspace.organizationId]
    if (workspace.roles.some(role => ['coach', 'assistant_coach'].includes(role))) {
      const { data } = await db.from('org_team_coaches').select('team_id,org_teams!inner(org_id)').eq('coach_id', userId).eq('org_teams.org_id', workspace.organizationId)
      return { kind: 'coach', organizationIds, teamIds: unique((data || []).map((row: any) => row.team_id)), athleteIds: [] }
    }
    const { data } = await db.from('org_teams').select('id').eq('org_id', workspace.organizationId)
    return { kind: 'organization', organizationIds, teamIds: unique((data || []).map((row: any) => row.id)), athleteIds: [] }
  }

  const athlete = await resolveAuthorizedAthleteContext(userId, requestedAthleteId)
  if (!athlete) return null
  return { kind: 'family', organizationIds: [], teamIds: [], athleteIds: [athlete.profileId] }
}

async function leagueIdsForScope(scope: Scope) {
  if (scope.kind === 'organization') {
    const { data } = await db.from('league_organizations').select('league_id').in('org_id', scope.organizationIds).eq('status', 'active')
    return unique((data || []).map((row: any) => row.league_id))
  }
  if (scope.kind === 'coach') {
    if (!scope.teamIds.length) return []
    const { data } = await db.from('league_team_assignments').select('league_id').in('team_id', scope.teamIds).neq('participation_status', 'withdrawn')
    return unique((data || []).map((row: any) => row.league_id))
  }
  const { data } = await db.from('league_registrations').select('league_id').in('athlete_id', scope.athleteIds).neq('status', 'withdrawn')
  const registered = unique((data || []).map((row: any) => row.league_id))
  const { data: available } = await db.from('league_competitions').select('league_id').eq('is_active', true)
  return unique([...registered, ...(available || []).map((row: any) => row.league_id)])
}

const registrationQueryForScope = (scope: Scope, leagueIds: string[]) => {
  let query = db.from('league_registrations').select('*').in('league_id', leagueIds).order('created_at', { ascending: false })
  if (scope.kind === 'organization') query = query.in('org_id', scope.organizationIds)
  else if (scope.kind === 'coach') query = query.in('team_id', scope.teamIds)
  else query = query.in('athlete_id', scope.athleteIds)
  return query
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const url = new URL(request.url)
  const scope = await resolveScope(request, session.user.id, url.searchParams.get('athlete_profile_id'))
  if (!scope) return NextResponse.json({ error: 'An authorized organization, team, or athlete profile is required.' }, { status: 403 })
  const leagueIds = await leagueIdsForScope(scope)
  if (!leagueIds.length) return NextResponse.json({ scope: scope.kind, leagues: [], competitions: [], registrations: [], games: [], venues: [], fields: [], brackets: [], standings: [], documents: [], announcements: [] })

  const [{ data: leagues }, { data: seasons }, { data: competitions }, registrationsResult, { data: assignments }, { data: games }, { data: venues }, { data: documents }, { data: announcements }] = await Promise.all([
    db.from('leagues').select('id,name,sport,general_location').in('id', leagueIds).eq('status', 'active'),
    db.from('league_seasons').select('id,league_id,name,start_date,end_date,registration_status,is_active').in('league_id', leagueIds).order('start_date', { ascending: false }),
    db.from('league_competitions').select('*').in('league_id', leagueIds).eq('is_active', true).order('registration_opens_at'),
    registrationQueryForScope(scope, leagueIds),
    db.from('league_team_assignments').select('id,league_id,season_id,team_id,division_id,status,participation_status').in('league_id', leagueIds),
    db.from('league_games').select('id,league_id,season_id,competition_id,division_id,home_team_id,away_team_id,venue_id,venue_field_id,arrival_at,starts_at,ends_at,location,status,result_status,home_score,away_score').in('league_id', leagueIds).order('starts_at'),
    db.from('league_venues').select('*').in('league_id', leagueIds).eq('is_active', true).order('name'),
    db.from('league_documents').select('id,league_id,season_id,title,document_type,target_type,due_at,is_required').in('league_id', leagueIds).order('due_at'),
    db.from('league_announcements').select('id,league_id,season_id,title,body,audience,published_at').in('league_id', leagueIds).order('published_at', { ascending: false }).limit(100),
  ])
  const registrations = registrationsResult.data || []
  const scopedTeamIds = unique(scope.kind === 'family' ? registrations.map((row: any) => row.team_id) : scope.teamIds)
  const scopedAssignments = (assignments || []).filter((row: any) => scopedTeamIds.includes(row.team_id))
  const scopedGames = (games || []).filter((row: any) => scopedTeamIds.includes(row.home_team_id) || scopedTeamIds.includes(row.away_team_id))
  const venueIds = unique((venues || []).map((row: any) => row.id))
  const competitionIds = unique((competitions || []).map((row: any) => row.id))
  const registrationIds = unique(registrations.map((row: any) => row.id))
  const athleteIds = unique(registrations.map((row: any) => row.athlete_id))
  const teamIds = unique([...scopedTeamIds, ...registrations.map((row: any) => row.team_id)])
  let submissionsQuery = db.from('league_document_submissions').select('id,document_id,org_id,team_id,status,notes,created_at').in('league_id', leagueIds)
  if (scope.kind === 'organization') submissionsQuery = submissionsQuery.in('org_id', scope.organizationIds)
  else if (scope.kind === 'coach') submissionsQuery = submissionsQuery.in('team_id', scope.teamIds)
  else submissionsQuery = submissionsQuery.eq('submitted_by', session.user.id)
  let feeAssignmentsQuery = db.from('league_fee_assignments').select('id,registration_id,league_id,fee_id,org_id,athlete_id,amount_cents,paid_cents,refunded_cents,status,due_at,paid_at,receipt_url').in('league_id', leagueIds).order('created_at', { ascending: false })
  if (scope.kind === 'organization') feeAssignmentsQuery = feeAssignmentsQuery.in('org_id', scope.organizationIds)
  else if (scope.kind === 'coach') feeAssignmentsQuery = feeAssignmentsQuery.in('org_id', scope.organizationIds)
  else feeAssignmentsQuery = feeAssignmentsQuery.in('athlete_id', scope.athleteIds)
  const visibleDocuments = (documents || []).filter((row: any) => scope.kind === 'family' ? row.target_type === 'athlete' : scope.kind === 'coach' ? ['coach','team'].includes(row.target_type) : ['organization','team'].includes(row.target_type))
  const documentIds = unique(visibleDocuments.map((row: any) => row.id))
  const [{ data: fields }, { data: brackets }, { data: athletes }, { data: teams }, { data: submissions }, { data: signatures }, { data: redemptions }, { data: feeAssignments }] = await Promise.all([
    venueIds.length ? db.from('league_venue_fields').select('*').in('venue_id', venueIds).eq('is_active', true) : Promise.resolve({ data: [] }),
    competitionIds.length ? db.from('league_bracket_entries').select('*').in('competition_id', competitionIds).order('round_number').order('slot_number') : Promise.resolve({ data: [] }),
    athleteIds.length ? db.from('athlete_profiles').select('id,full_name,avatar_url').in('id', athleteIds) : Promise.resolve({ data: [] }),
    teamIds.length ? db.from('org_teams').select('id,org_id,name').in('id', teamIds) : Promise.resolve({ data: [] }),
    submissionsQuery,
    documentIds.length ? db.from('league_document_signatures').select('id,document_id,signed_at,signature_hash').eq('user_id', session.user.id).in('document_id', documentIds) : Promise.resolve({ data: [] }),
    registrationIds.length ? db.from('league_discount_redemptions').select('registration_id,original_amount_cents,discount_amount_cents,final_amount_cents,redeemed_at').in('registration_id', registrationIds) : Promise.resolve({ data: [] }),
    feeAssignmentsQuery,
  ])
  const teamById = new Map((teams || []).map((row: any) => [row.id, row]))
  const athleteById = new Map((athletes || []).map((row: any) => [row.id, row]))
  const venueById = new Map((venues || []).map((row: any) => [row.id, row]))
  const fieldById = new Map((fields || []).map((row: any) => [row.id, row]))
  const redemptionByRegistration = new Map((redemptions || []).map((row: any) => [row.registration_id, row]))
  const requiredDocuments = visibleDocuments.filter((row: any) => row.is_required)
  const documentStatusById = new Map((submissions || []).map((row: any) => [row.document_id, row.status]))
  for (const signature of signatures || []) documentStatusById.set(signature.document_id, 'signed')
  const standings = await Promise.all(leagueIds.map(async leagueId => {
    const season = (seasons || []).find((row: any) => row.league_id === leagueId && row.is_active)
    if (!season) return { league_id: leagueId, rows: [] }
    const { data } = await (supabase as any).rpc('league_scoped_standings', { p_league_id: leagueId, p_season_id: season.id, p_age_group: null, p_division_id: null })
    return { league_id: leagueId, rows: data || [] }
  }))

  return NextResponse.json({
    scope: scope.kind,
    leagues: leagues || [], seasons: seasons || [], competitions: competitions || [], assignments: scopedAssignments, fields: fields || [], brackets: brackets || [], standings,
    registrations: registrations.map((row: any) => {
      const missingRequirements: string[] = []
      if (row.eligibility_status !== 'eligible') missingRequirements.push(`Eligibility is ${String(row.eligibility_status || 'pending').replaceAll('_', ' ')}`)
      if (!['paid','not_required','waived','credited'].includes(row.payment_status)) missingRequirements.push(`Payment is ${String(row.payment_status || 'unpaid').replaceAll('_', ' ')}`)
      for (const document of requiredDocuments.filter((item: any) => !item.season_id || item.season_id === row.season_id)) if (!['approved','signed'].includes(String(documentStatusById.get(document.id) || ''))) missingRequirements.push(`${document.title}: ${documentStatusById.get(document.id) || 'missing'}`)
      return { ...row, athlete: athleteById.get(row.athlete_id) || null, team: teamById.get(row.team_id) || null, discount: redemptionByRegistration.get(row.id) || null, missing_requirements: missingRequirements, participation_allowed: missingRequirements.length === 0 && ['approved','eligible','registered'].includes(row.status) }
    }),
    games: scopedGames.map((row: any) => ({ ...row, home_team: teamById.get(row.home_team_id) || null, away_team: teamById.get(row.away_team_id) || null, venue: venueById.get(row.venue_id) || null, field: fieldById.get(row.venue_field_id) || null })),
    venues: venues || [], documents: visibleDocuments, document_statuses: [...(submissions || []), ...(signatures || []).map((row: any) => ({ ...row, status: 'signed' }))], announcements: announcements || [], fee_assignments: feeAssignments || [],
    authorized_teams: scope.teamIds.map(id => teamById.get(id)).filter(Boolean), authorized_athlete_ids: scope.athleteIds,
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const scope = await resolveScope(request, session.user.id, body?.athlete_profile_id)
  if (!scope) return NextResponse.json({ error: 'An authorized organization, team, or athlete profile is required.' }, { status: 403 })
  const action = String(body?.action || '')
  if (action === 'submit_registration') {
    const registrationType = String(body?.registration_type || '')
    const athleteId = String(body?.athlete_profile_id || '') || null
    const teamId = String(body?.team_id || '') || null
    if (scope.kind === 'family' && (!athleteId || !scope.athleteIds.includes(athleteId))) return NextResponse.json({ error: 'Select an authorized athlete profile.' }, { status: 403 })
    if (scope.kind !== 'family' && (!teamId || !scope.teamIds.includes(teamId))) return NextResponse.json({ error: 'Select a team you are authorized to manage.' }, { status: 403 })
    const { data, error } = await (supabase as any).rpc('submit_league_registration', { p_competition_id: String(body?.competition_id || ''), p_registration_type: registrationType, p_athlete_id: athleteId, p_team_id: teamId })
    if (error) return NextResponse.json({ error: String(error.message || 'Unable to submit registration.') }, { status: 409 })
    const { data: registration } = await db.from('league_registrations').select('id,league_id,season_id,competition_id,org_id,athlete_id,final_amount_cents,payment_status').eq('id', data).single()
    let feeAssignmentId: string | null = null
    if (registration && Number(registration.final_amount_cents) > 0) {
      const { data: fee } = await db.from('league_fees').select('id,due_at').eq('league_id', registration.league_id).eq('season_id', registration.season_id).eq('status', 'active').or(`competition_id.is.null,competition_id.eq.${registration.competition_id}`).order('amount_cents', { ascending: false }).limit(1).maybeSingle()
      if (!fee) return NextResponse.json({ error: 'Registration was saved, but its league fee configuration is unavailable.' }, { status: 409 })
      const { data: assignment, error: assignmentError } = await db.from('league_fee_assignments').upsert({ registration_id: registration.id, league_id: registration.league_id, fee_id: fee.id, org_id: registration.org_id, athlete_id: registration.athlete_id, amount_cents: registration.final_amount_cents, paid_cents: 0, status: 'unpaid', due_at: fee.due_at }, { onConflict: 'registration_id' }).select('id').single()
      if (assignmentError) return NextResponse.json({ error: 'Registration was saved, but its payment assignment could not be created.' }, { status: 500 })
      feeAssignmentId = assignment.id
    }
    return NextResponse.json({ registration_id: data, fee_assignment_id: feeAssignmentId }, { status: 201 })
  }
  if (action === 'apply_discount') {
    const registrationId = String(body?.registration_id || '')
    const leagueIds = await leagueIdsForScope(scope)
    const registration = (await registrationQueryForScope(scope, leagueIds)).data?.find((row: any) => row.id === registrationId)
    if (!registration) return NextResponse.json({ error: 'Registration not found.' }, { status: 404 })
    const { data, error } = await (supabase as any).rpc('apply_league_discount', { p_registration_id: registrationId, p_code: String(body?.code || '').trim() })
    if (error) return NextResponse.json({ error: String(error.message || 'Unable to apply discount.') }, { status: 409 })
    return NextResponse.json({ pricing: Array.isArray(data) ? data[0] : data })
  }
  if (action === 'game_action') {
    if (scope.kind !== 'coach' && scope.kind !== 'organization') return NextResponse.json({ error: 'Team staff access is required.' }, { status: 403 })
    const gameId=String(body?.game_id||''),gameAction=String(body?.game_action||''),homeScore=body?.home_score==null?null:Number(body.home_score),awayScore=body?.away_score==null?null:Number(body.away_score)
    const { data: game } = await db.from('league_games').select('id,home_team_id,away_team_id').eq('id',gameId).maybeSingle()
    if (!game || !scope.teamIds.some(id=>id===game.home_team_id||id===game.away_team_id)) return NextResponse.json({ error: 'You are not authorized for this game.' }, { status: 403 })
    const { data, error } = await (supabase as any).rpc('submit_league_game_action',{p_game_id:gameId,p_action:gameAction,p_home_score:Number.isInteger(homeScore)?homeScore:null,p_away_score:Number.isInteger(awayScore)?awayScore:null,p_reason:String(body?.reason||'')||null,p_proposed_starts_at:body?.proposed_starts_at||null})
    if(error)return NextResponse.json({error:String(error.message||'Unable to submit game action.')},{status:409})
    return NextResponse.json({action_id:data})
  }
  if (action === 'sign_document') {
    const signerCapacity = scope.kind === 'family' ? 'athlete_or_guardian' : scope.kind === 'coach' ? 'coach' : 'organization_representative'
    const { data, error } = await (supabase as any).rpc('sign_league_document', {
      p_document_id: String(body?.document_id || ''), p_signer_name: String(body?.signer_name || '').trim(),
      p_signer_capacity: signerCapacity, p_authority_attested: body?.authority_attested === true,
      p_consent_attested: body?.consent_attested === true, p_consent_version: 'web-v1',
      p_client_platform: 'web', p_client_app_version: process.env.NEXT_PUBLIC_APP_VERSION || null,
    })
    if (error) return NextResponse.json({ error: String(error.message || 'Unable to sign league document.') }, { status: 409 })
    return NextResponse.json({ signature_id: data }, { status: 201 })
  }
  return NextResponse.json({ error: 'Unsupported league lifecycle action.' }, { status: 400 })
}
