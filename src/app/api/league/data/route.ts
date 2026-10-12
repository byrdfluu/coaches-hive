import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { leagueCan, requireLeagueMembership } from '@/lib/leagueAuthority'
import { emitTenantEvent, leagueNotificationContext, leagueParticipantRecipients, leagueStaffRecipients } from '@/lib/notificationProducers'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'

export const dynamic = 'force-dynamic'
const resources = { clubs:'league_organizations', divisions:'league_divisions', teams:'league_team_assignments', schedule:'league_games', venues:'league_venues', registrations:'league_registrations', payments:'league_fee_assignments', documents:'league_documents', submissions:'league_document_submissions', announcements:'league_announcements', staff:'league_memberships', permissions:'league_permissions', seasons:'league_seasons', audit:'league_audit_events' } as const
const leagueDocumentURL = async (path: unknown) => {
  if (typeof path !== 'string' || !path) return null
  const { data, error } = await supabaseAdmin.storage.from('league-documents').createSignedUrl(path, 300)
  return error ? null : data.signedUrl
}
const managePermissionFor = (resource: string) => ({
  clubs: 'manage_organizations', divisions: 'manage_divisions', teams: 'manage_teams',
  schedule: 'manage_schedule', venues: 'manage_schedule', registrations: 'manage_registrations',
  payments: 'manage_payments', documents: 'manage_documents', submissions: 'manage_documents',
  announcements: 'send_announcements', staff: 'manage_members', permissions: 'manage_members',
  seasons: 'manage_seasons', audit: 'view_audit',
} as Record<string,string>)[resource] || `manage_${resource}`
const leagueActionMessage = (caught: unknown, fallback: string) => {
  const message = String((caught as { message?: unknown } | null)?.message || '')
  for (const known of [
    'This league needs an active League & Enterprise plan before it can add organizations.',
    'That organization needs an active Coaches Hive plan before it can join this league.',
    'A selected team already has a game during this time.',
    'This venue is already booked during this time.',
    'Season does not belong to this league',
    'League result permission required',
  ]) if (message.includes(known)) return known
  return fallback
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const url = new URL(request.url), resource = String(url.searchParams.get('resource') || '')
  if (!(resource in resources)) return NextResponse.json({ error: 'That league section is unavailable.' }, { status: 400 })
  const authority = await requireLeagueMembership(session.user.id, request.headers.get('x-workspace-id'))
  if (!authority) return NextResponse.json({ error: 'Your league access is no longer active.' }, { status: 403 })
  let query = supabaseAdmin.from(resources[resource as keyof typeof resources]).select('*').eq('league_id', authority.league_id).limit(500)
  if (resource === 'audit') query = query.order('occurred_at', { ascending: false })
  else if (resource === 'schedule') query = query.order('starts_at', { ascending: true })
  else if (resource === 'clubs') query = query.order('joined_at', { ascending: false })
  else query = query.order('created_at', { ascending: false })
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Unable to load this league section. Please retry.' }, { status: 500 })
  const rows = (data || []) as any[], profileIds = new Set<string>(), athleteIds = new Set<string>(), orgIds = new Set<string>(), teamIds = new Set<string>(), feeIds = new Set<string>()
  for (const row of rows) {
    for (const key of ['user_id','submitted_by']) if (row[key]) profileIds.add(row[key])
    if (row.athlete_id) athleteIds.add(row.athlete_id)
    if (row.org_id) orgIds.add(row.org_id)
    if (row.fee_id) feeIds.add(row.fee_id)
    for (const key of ['team_id','home_team_id','away_team_id']) if (row[key]) teamIds.add(row[key])
  }
  const [{ data: profiles }, { data: athletes }, { data: orgs }, { data: teams }, { data: fees }] = await Promise.all([
    profileIds.size ? supabaseAdmin.from('profiles').select('id,full_name,avatar_url').in('id', Array.from(profileIds)) : Promise.resolve({ data: [] }),
    athleteIds.size ? supabaseAdmin.from('athlete_profiles').select('id,full_name,avatar_url').in('id', Array.from(athleteIds)) : Promise.resolve({ data: [] }),
    orgIds.size ? supabaseAdmin.from('org_settings').select('org_id,org_name,brand_logo_url').in('org_id', Array.from(orgIds)) : Promise.resolve({ data: [] }),
    teamIds.size ? supabaseAdmin.from('org_teams').select('id,name').in('id', Array.from(teamIds)) : Promise.resolve({ data: [] }),
    feeIds.size ? supabaseAdmin.from('league_fees').select('id,title').in('id', Array.from(feeIds)) : Promise.resolve({ data: [] }),
  ])
  const enriched = await Promise.all(rows.map(async row => ({ ...row, user:(profiles||[]).find(p=>p.id===row.user_id)||null, athlete:(athletes||[]).find(p=>p.id===row.athlete_id)||null, organization:(orgs||[]).find(o=>o.org_id===row.org_id)||null, fee:(fees||[]).find(f=>f.id===row.fee_id)||null, team:(teams||[]).find(t=>t.id===row.team_id)||null, home_team:(teams||[]).find(t=>t.id===row.home_team_id)||null, away_team:(teams||[]).find(t=>t.id===row.away_team_id)||null, signed_url:resource==='documents'||resource==='submissions'?await leagueDocumentURL(row.storage_path):undefined })))
  const managePermission = managePermissionFor(resource)
  if (resource === 'payments') {
    const [{ data: feeTypes }, { data: leagueOrgs }, { data: registrations }] = await Promise.all([
      supabaseAdmin.from('league_fees').select('id,title,amount_cents,due_at,status').eq('league_id', authority.league_id).order('due_at'),
      supabaseAdmin.from('league_organizations').select('org_id').eq('league_id', authority.league_id).eq('status', 'active'),
      supabaseAdmin.from('league_registrations').select('athlete_id').eq('league_id', authority.league_id).neq('status', 'withdrawn'),
    ])
    const optionOrgIds = Array.from(new Set((leagueOrgs || []).map(row => row.org_id).filter(Boolean)))
    const optionAthleteIds = Array.from(new Set((registrations || []).map(row => row.athlete_id).filter(Boolean)))
    const [{ data: optionOrgs }, { data: optionAthletes }] = await Promise.all([
      optionOrgIds.length ? supabaseAdmin.from('org_settings').select('org_id,org_name').in('org_id', optionOrgIds) : Promise.resolve({ data: [] }),
      optionAthleteIds.length ? supabaseAdmin.from('athlete_profiles').select('id,full_name').in('id', optionAthleteIds) : Promise.resolve({ data: [] }),
    ])
    return NextResponse.json({ resource, league_id: authority.league_id, role: authority.role, can_manage: leagueCan(authority, managePermission), rows: enriched, fees: feeTypes || [], organizations: optionOrgs || [], athletes: optionAthletes || [] })
  }
  if (resource === 'documents') {
    const { data: leagueOrgs } = await supabaseAdmin.from('league_organizations').select('org_id').eq('league_id', authority.league_id).eq('status', 'active')
    const optionOrgIds = Array.from(new Set((leagueOrgs || []).map(row => row.org_id).filter(Boolean)))
    const { data: optionOrgs } = optionOrgIds.length
      ? await supabaseAdmin.from('org_settings').select('org_id,org_name').in('org_id', optionOrgIds)
      : { data: [] }
    return NextResponse.json({ resource, league_id: authority.league_id, role: authority.role, can_manage: leagueCan(authority, managePermission), rows: enriched, organizations: optionOrgs || [] })
  }
  if (resource === 'clubs') {
    const { data: availableOrganizations } = await supabase.rpc('discover_public_organizations')
    return NextResponse.json({ resource, league_id: authority.league_id, role: authority.role, can_manage: leagueCan(authority, managePermission), rows: enriched, available_organizations: availableOrganizations || [] })
  }
  if (['divisions','teams','schedule'].includes(resource)) {
    const [{ data: seasons }, { data: assignments }, { data: divisions }, { data: venues }, { data: leagueOrgs }] = await Promise.all([
      supabaseAdmin.from('league_seasons').select('*').eq('league_id', authority.league_id).order('start_date', { ascending: false }),
      supabaseAdmin.from('league_team_assignments').select('*').eq('league_id', authority.league_id).eq('status', 'active'),
      supabaseAdmin.from('league_divisions').select('*').eq('league_id', authority.league_id).order('name'),
      supabaseAdmin.from('league_venues').select('*').eq('league_id', authority.league_id).eq('is_active', true).order('name'),
      supabaseAdmin.from('league_organizations').select('org_id').eq('league_id', authority.league_id).eq('status', 'active'),
    ])
    const assignmentTeamIds = Array.from(new Set((assignments || []).map(row => row.team_id).filter(Boolean)))
    const leagueOrgIds = Array.from(new Set((leagueOrgs || []).map(row => row.org_id).filter(Boolean)))
    const [{ data: assignedTeams }, { data: candidateTeams }, { data: optionOrgs }] = await Promise.all([
      assignmentTeamIds.length ? supabaseAdmin.from('org_teams').select('id,org_id,name').in('id', assignmentTeamIds) : Promise.resolve({ data: [] }),
      leagueOrgIds.length ? supabaseAdmin.from('org_teams').select('id,org_id,name').in('org_id', leagueOrgIds).order('name') : Promise.resolve({ data: [] }),
      leagueOrgIds.length ? supabaseAdmin.from('org_settings').select('org_id,org_name').in('org_id', leagueOrgIds) : Promise.resolve({ data: [] }),
    ])
    const teamById = new Map((assignedTeams || []).map(team => [team.id, team]))
    const enrichedAssignments = (assignments || []).map(row => ({ ...row, team: teamById.get(row.team_id) || null }))
    return NextResponse.json({ resource, league_id: authority.league_id, role: authority.role, can_manage: leagueCan(authority, managePermission), rows: enriched, seasons: seasons || [], divisions: divisions || [], team_assignments: enrichedAssignments, teams: candidateTeams || [], venues: venues || [], organizations: optionOrgs || [] })
  }
  return NextResponse.json({ resource, league_id: authority.league_id, role: authority.role, can_manage: leagueCan(authority, managePermission), rows: enriched })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null), authority = await requireLeagueMembership(session.user.id, request.headers.get('x-workspace-id'))
  if (!authority) return NextResponse.json({ error: 'Your league access is no longer active.' }, { status: 403 })
  const leagueId = authority.league_id
  if (body?.league_id && String(body.league_id).toLowerCase() !== String(leagueId).toLowerCase()) return NextResponse.json({ error: 'The selected workspace does not match the request.' }, { status: 409 })
  const action=String(body?.action||'')
  const audit=async(eventType:string,recordType:string,recordId:string,metadata:Record<string,unknown>={})=>supabaseAdmin.from('league_audit_events').insert({league_id:leagueId,actor_user_id:session.user.id,event_type:eventType,record_type:recordType,record_id:recordId,metadata})
  const notify = async (input:{ audience:'staff'|'participants';type:string;category:string;title:string;body:string;destination:string;resourceId:string;state:string;data?:Record<string,unknown> }) => {
    const [context, recipientIds] = await Promise.all([
      leagueNotificationContext(leagueId),
      input.audience === 'participants' ? leagueParticipantRecipients(leagueId) : leagueStaffRecipients(leagueId, session.user.id),
    ])
    return emitTenantEvent({ ...input, recipientIds: recipientIds.filter(id => id !== session.user.id), context })
  }
  if(action==='add_organization'){
    if(!leagueCan(authority,'manage_organizations'))return NextResponse.json({error:'You do not have permission to manage league organizations.'},{status:403})
    const orgId=String(body?.org_id||'');if(!orgId)return NextResponse.json({error:'Select an organization to add.'},{status:400})
    const{data,error}=await supabase.rpc('add_organization_to_league',{p_league_id:leagueId,p_org_id:orgId})
    if(error)return NextResponse.json({error:leagueActionMessage(error,'The organization could not be added.')},{status:409})
    return NextResponse.json({organization_id:data},{status:201})
  }
  if(action==='remove_organization'){
    if(!leagueCan(authority,'manage_organizations'))return NextResponse.json({error:'You do not have permission to manage league organizations.'},{status:403})
    const orgId=String(body?.org_id||'');const{data,error}=await supabaseAdmin.from('league_organizations').update({status:'inactive'}).eq('league_id',leagueId).eq('org_id',orgId).eq('status','active').select('id').maybeSingle()
    if(error)return NextResponse.json({error:'The organization could not be removed.'},{status:500});if(!data)return NextResponse.json({error:'Active league organization not found.'},{status:404})
    await audit('league.organization.removed','league_organization',data.id,{org_id:orgId});return NextResponse.json({removed:true})
  }
  if(action==='update_registration_status'){
    if(!leagueCan(authority,'manage_registrations'))return NextResponse.json({error:'You do not have permission to manage registrations.'},{status:403})
    const registrationId=String(body?.registration_id||''),status=String(body?.status||'')
    if(!registrationId||!['pending','eligible','ineligible','waitlisted','withdrawn'].includes(status))return NextResponse.json({error:'A valid registration status is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_registrations').update({status}).eq('id',registrationId).eq('league_id',leagueId).select('id,status').maybeSingle()
    if(error)return NextResponse.json({error:'The registration could not be updated.'},{status:500})
    if(!data)return NextResponse.json({error:'Registration not found.'},{status:404})
    await audit('league.registration.status_updated','league_registration',data.id,{status})
    return NextResponse.json({registration:data})
  }
  if(action==='create_fee'){
    if(!leagueCan(authority,'manage_payments'))return NextResponse.json({error:'You do not have permission to manage league fees.'},{status:403})
    const title=String(body?.title||'').trim(),amountCents=Number(body?.amount_cents)
    if(!title||!Number.isSafeInteger(amountCents)||amountCents<=0)return NextResponse.json({error:'A fee title and positive whole-cent amount are required.'},{status:400})
    const connect=await loadStripeConnectAccountStatus('league',leagueId,{refresh:true})
    const deploymentIsLive=String(process.env.STRIPE_SECRET_KEY||'').startsWith('sk_live_')
    if(!isStripeConnectEnabled(connect)||Boolean(connect?.livemode)!==deploymentIsLive)return NextResponse.json({error:'Finish Stripe Connect setup for this league before creating a paid fee.'},{status:409})
    const{data,error}=await supabaseAdmin.from('league_fees').insert({league_id:leagueId,title,amount_cents:amountCents,due_at:body?.due_at||null,status:'active'}).select('*').single()
    if(error)return NextResponse.json({error:'The fee could not be created.'},{status:500})
    await audit('league.fee.created','league_fee',data.id,{amount_cents:amountCents})
    return NextResponse.json({fee:data},{status:201})
  }
  if(action==='assign_fee'){
    if(!leagueCan(authority,'manage_payments'))return NextResponse.json({error:'You do not have permission to manage league fees.'},{status:403})
    const feeId=String(body?.fee_id||''),targetType=String(body?.target_type||''),targetIds=Array.isArray(body?.target_ids)?Array.from(new Set(body.target_ids.map(String).filter(Boolean))):[],amountCents=Number(body?.amount_cents)
    if(!feeId||!['organization','athlete'].includes(targetType)||!targetIds.length||!Number.isSafeInteger(amountCents)||amountCents<=0)return NextResponse.json({error:'Fee, recipients, and a positive whole-cent amount are required.'},{status:400})
    const{data:fee}=await supabaseAdmin.from('league_fees').select('id').eq('id',feeId).eq('league_id',leagueId).eq('status','active').maybeSingle()
    if(!fee)return NextResponse.json({error:'Active league fee not found.'},{status:404})
    let allowedIds:string[]=[]
    if(targetType==='organization'){
      const{data}=await supabaseAdmin.from('league_organizations').select('org_id').eq('league_id',leagueId).eq('status','active').in('org_id',targetIds);allowedIds=(data||[]).map(row=>row.org_id)
    }else{
      const{data}=await supabaseAdmin.from('league_registrations').select('athlete_id').eq('league_id',leagueId).neq('status','withdrawn').in('athlete_id',targetIds);allowedIds=Array.from(new Set((data||[]).map(row=>row.athlete_id)))
    }
    if(allowedIds.length!==targetIds.length)return NextResponse.json({error:'One or more selected recipients are outside this league.'},{status:403})
    let existingQuery=supabaseAdmin.from('league_fee_assignments').select(targetType==='organization'?'org_id':'athlete_id').eq('fee_id',feeId).eq('league_id',leagueId)
    existingQuery=targetType==='organization'?existingQuery.in('org_id',allowedIds):existingQuery.in('athlete_id',allowedIds)
    const{data:existing}=await existingQuery
    const existingIds=new Set((existing||[]).map((row:any)=>targetType==='organization'?row.org_id:row.athlete_id))
    const newIds=allowedIds.filter(id=>!existingIds.has(id))
    if(!newIds.length)return NextResponse.json({created:0})
    const rowsToInsert=newIds.map(id=>({league_id:leagueId,fee_id:feeId,org_id:targetType==='organization'?id:null,athlete_id:targetType==='athlete'?id:null,amount_cents:amountCents,paid_cents:0,status:'unpaid',due_at:body?.due_at||null}))
    const{data,error}=await supabaseAdmin.from('league_fee_assignments').insert(rowsToInsert).select('id')
    if(error)return NextResponse.json({error:'The fee assignments could not be created.'},{status:500})
    await Promise.all((data||[]).map(row=>audit('league.fee.assigned','league_fee_assignment',row.id,{fee_id:feeId,target_type:targetType})))
    return NextResponse.json({created:data?.length||0},{status:201})
  }
  if(action==='waive_fee_assignment'){
    if(!leagueCan(authority,'manage_payments'))return NextResponse.json({error:'You do not have permission to manage league fees.'},{status:403})
    const assignmentId=String(body?.assignment_id||'')
    const{data,error}=await supabaseAdmin.from('league_fee_assignments').update({status:'waived',updated_at:new Date().toISOString()}).eq('id',assignmentId).eq('league_id',leagueId).in('status',['unpaid','partial']).select('id').maybeSingle()
    if(error)return NextResponse.json({error:'The fee assignment could not be waived.'},{status:500})
    if(!data)return NextResponse.json({error:'Only unpaid or partially paid assignments can be waived.'},{status:409})
    await audit('league.fee.waived','league_fee_assignment',data.id)
    return NextResponse.json({assignment:data})
  }
  if(action==='review_document_submission'){
    if(!leagueCan(authority,'manage_documents'))return NextResponse.json({error:'You do not have permission to review document submissions.'},{status:403})
    const submissionId=String(body?.submission_id||''),status=String(body?.status||'')
    if(!submissionId||!['approved','rejected'].includes(status))return NextResponse.json({error:'A submission and valid review status are required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_document_submissions').update({status,reviewed_by:session.user.id,reviewed_at:new Date().toISOString(),notes:String(body?.notes||'').trim()||null}).eq('id',submissionId).eq('league_id',leagueId).select('id').maybeSingle()
    if(error)return NextResponse.json({error:'The document submission could not be reviewed.'},{status:500})
    if(!data)return NextResponse.json({error:'Document submission not found.'},{status:404})
    await audit(`league.document_submission.${status}`,'league_document_submission',data.id)
    return NextResponse.json({submission:data})
  }
  if(action==='delete_document'){
    if(!leagueCan(authority,'manage_documents'))return NextResponse.json({error:'You do not have permission to delete league documents.'},{status:403})
    const documentId=String(body?.document_id||'')
    const[{data:document},{data:submissions}]=await Promise.all([
      supabaseAdmin.from('league_documents').select('id,storage_path').eq('id',documentId).eq('league_id',leagueId).maybeSingle(),
      supabaseAdmin.from('league_document_submissions').select('storage_path').eq('document_id',documentId).eq('league_id',leagueId),
    ])
    if(!document)return NextResponse.json({error:'League document not found.'},{status:404})
    const{error}=await supabaseAdmin.from('league_documents').delete().eq('id',document.id).eq('league_id',leagueId)
    if(error)return NextResponse.json({error:'The league document could not be deleted.'},{status:500})
    const paths=[document.storage_path,...(submissions||[]).map(row=>row.storage_path)].filter((path):path is string=>Boolean(path))
    if(paths.length){const{error:storageError}=await supabaseAdmin.storage.from('league-documents').remove(paths);if(storageError)console.error('[league/data] document cleanup failed',storageError)}
    await audit('league.document.deleted','league_document',document.id)
    return NextResponse.json({deleted:true})
  }
  if(action==='create_division'){
    if(!leagueCan(authority,'manage_divisions'))return NextResponse.json({error:'You do not have permission to manage divisions.'},{status:403})
    const name=String(body?.name||'').trim();if(!name)return NextResponse.json({error:'Division name is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_divisions').insert({league_id:leagueId,season_id:body?.season_id||null,name,age_group:String(body?.age_group||'')||null,competition_level:String(body?.competition_level||'')||null}).select('*').single();if(error)return NextResponse.json({error:'The division could not be created. Please retry.'},{status:500});await audit('league.division.created','league_division',data.id);await notify({audience:'staff',type:'league_division_created',category:'registrations',title:'League division created',body:name,destination:'/league/divisions',resourceId:data.id,state:'created'});return NextResponse.json({division:data},{status:201})
  }
  if(action==='update_division'){
    if(!leagueCan(authority,'manage_divisions'))return NextResponse.json({error:'You do not have permission to manage divisions.'},{status:403})
    const divisionId=String(body?.division_id||''),name=String(body?.name||'').trim();if(!divisionId||!name)return NextResponse.json({error:'Division and name are required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_divisions').update({name,age_group:String(body?.age_group||'').trim()||null,competition_level:String(body?.competition_level||'').trim()||null}).eq('id',divisionId).eq('league_id',leagueId).select('*').maybeSingle()
    if(error)return NextResponse.json({error:'The division could not be updated.'},{status:500});if(!data)return NextResponse.json({error:'Division not found.'},{status:404});await audit('league.division.updated','league_division',data.id);return NextResponse.json({division:data})
  }
  if(action==='delete_division'){
    if(!leagueCan(authority,'manage_divisions'))return NextResponse.json({error:'You do not have permission to manage divisions.'},{status:403})
    const divisionId=String(body?.division_id||'');const{data,error}=await supabaseAdmin.from('league_divisions').delete().eq('id',divisionId).eq('league_id',leagueId).select('id').maybeSingle()
    if(error)return NextResponse.json({error:'The division could not be deleted.'},{status:500});if(!data)return NextResponse.json({error:'Division not found.'},{status:404});await audit('league.division.deleted','league_division',data.id);return NextResponse.json({deleted:true})
  }
  if(action==='reassign_team_division'){
    if(!leagueCan(authority,'manage_divisions'))return NextResponse.json({error:'You do not have permission to manage divisions.'},{status:403})
    const assignmentId=String(body?.assignment_id||''),divisionId=String(body?.division_id||'')||null
    if(divisionId){const{data:division}=await supabaseAdmin.from('league_divisions').select('id').eq('id',divisionId).eq('league_id',leagueId).maybeSingle();if(!division)return NextResponse.json({error:'The selected division is outside this league.'},{status:403})}
    const{data,error}=await supabaseAdmin.from('league_team_assignments').update({division_id:divisionId}).eq('id',assignmentId).eq('league_id',leagueId).eq('status','active').select('id').maybeSingle()
    if(error)return NextResponse.json({error:'The team could not be reassigned.'},{status:500});if(!data)return NextResponse.json({error:'Team assignment not found.'},{status:404});await audit('league.team.division_updated','league_team_assignment',data.id,{division_id:divisionId});return NextResponse.json({assignment:data})
  }
  if(action==='assign_team'){
    if(!leagueCan(authority,'manage_teams'))return NextResponse.json({error:'You do not have permission to manage teams.'},{status:403})
    const seasonId=String(body?.season_id||''),teamId=String(body?.team_id||''),divisionId=String(body?.division_id||'')||null
    const[{data:season},{data:team}]=await Promise.all([supabaseAdmin.from('league_seasons').select('id').eq('id',seasonId).eq('league_id',leagueId).maybeSingle(),supabaseAdmin.from('org_teams').select('id,org_id').eq('id',teamId).maybeSingle()])
    if(!season||!team)return NextResponse.json({error:'A valid league season and organization team are required.'},{status:400})
    const{data:leagueOrg}=await supabaseAdmin.from('league_organizations').select('id').eq('league_id',leagueId).eq('org_id',team.org_id).eq('status','active').maybeSingle();if(!leagueOrg)return NextResponse.json({error:'That team organization is not active in this league.'},{status:403})
    if(divisionId){const{data:division}=await supabaseAdmin.from('league_divisions').select('id').eq('id',divisionId).eq('league_id',leagueId).eq('season_id',seasonId).maybeSingle();if(!division)return NextResponse.json({error:'The selected division does not belong to this season.'},{status:400})}
    const{data,error}=await supabaseAdmin.from('league_team_assignments').upsert({league_id:leagueId,season_id:seasonId,division_id:divisionId,org_id:team.org_id,team_id:teamId,status:'active'},{onConflict:'league_id,season_id,team_id'}).select('*').single()
    if(error)return NextResponse.json({error:leagueActionMessage(error,'The team could not be assigned.')},{status:409});await audit('league.team.assigned','league_team_assignment',data.id,{team_id:teamId,season_id:seasonId});return NextResponse.json({assignment:data},{status:201})
  }
  if(action==='remove_team'){
    if(!leagueCan(authority,'manage_teams'))return NextResponse.json({error:'You do not have permission to manage teams.'},{status:403})
    const assignmentId=String(body?.assignment_id||'');const{data,error}=await supabaseAdmin.from('league_team_assignments').update({status:'withdrawn'}).eq('id',assignmentId).eq('league_id',leagueId).eq('status','active').select('id').maybeSingle()
    if(error)return NextResponse.json({error:'The team could not be removed.'},{status:500});if(!data)return NextResponse.json({error:'Active team assignment not found.'},{status:404});await audit('league.team.removed','league_team_assignment',data.id);return NextResponse.json({removed:true})
  }
  if(action==='create_season'){
    if(!leagueCan(authority,'manage_seasons'))return NextResponse.json({error:'You do not have permission to manage seasons.'},{status:403})
    const name=String(body?.name||'').trim();if(!name)return NextResponse.json({error:'Season name is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_seasons').insert({league_id:leagueId,name,start_date:body?.start_date||null,end_date:body?.end_date||null,is_active:false,registration_status:String(body?.registration_status||'closed')}).select('*').single();if(error)return NextResponse.json({error:'The season could not be created. Please retry.'},{status:500})
    if(Boolean(body?.is_active)){const{error:activateError}=await supabase.rpc('league_set_active_season',{p_league_id:leagueId,p_season_id:data.id});if(activateError){await supabaseAdmin.from('league_seasons').delete().eq('id',data.id).eq('league_id',leagueId);return NextResponse.json({error:'The season could not be activated.'},{status:409})}}
    await audit('league.season.created','league_season',data.id);await notify({audience:'participants',type:'league_season_created',category:'schedule',title:'League season created',body:name,destination:'/league/schedule',resourceId:data.id,state:'created'});return NextResponse.json({season:{...data,is_active:Boolean(body?.is_active)}},{status:201})
  }
  if(action==='update_season'){
    if(!leagueCan(authority,'manage_seasons'))return NextResponse.json({error:'You do not have permission to manage seasons.'},{status:403})
    const seasonId=String(body?.season_id||''),name=String(body?.name||'').trim(),registrationStatus=String(body?.registration_status||'closed');if(!seasonId||!name||!['draft','open','closed'].includes(registrationStatus))return NextResponse.json({error:'Season, name, and registration status are required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_seasons').update({name,start_date:body?.start_date||null,end_date:body?.end_date||null,registration_status:registrationStatus}).eq('id',seasonId).eq('league_id',leagueId).select('*').maybeSingle()
    if(error)return NextResponse.json({error:'The season could not be updated.'},{status:500});if(!data)return NextResponse.json({error:'Season not found.'},{status:404});await audit('league.season.updated','league_season',data.id);return NextResponse.json({season:data})
  }
  if(action==='set_active_season'){
    if(!leagueCan(authority,'manage_seasons'))return NextResponse.json({error:'You do not have permission to manage seasons.'},{status:403})
    const seasonId=String(body?.season_id||'');const{error}=await supabase.rpc('league_set_active_season',{p_league_id:leagueId,p_season_id:seasonId});if(error)return NextResponse.json({error:leagueActionMessage(error,'The active season could not be changed.')},{status:409});return NextResponse.json({active_season_id:seasonId})
  }
  if(action==='save_game'){
    if(!leagueCan(authority,'manage_schedule'))return NextResponse.json({error:'You do not have permission to manage the schedule.'},{status:403})
    const gameId=String(body?.game_id||''),seasonId=String(body?.season_id||''),homeTeamId=String(body?.home_team_id||''),awayTeamId=String(body?.away_team_id||''),startsAt=String(body?.starts_at||''),status=String(body?.status||'scheduled')
    if(!seasonId||!homeTeamId||!awayTeamId||homeTeamId===awayTeamId||!startsAt||!['scheduled','in_progress','cancelled','postponed'].includes(status))return NextResponse.json({error:'Season, two different teams, start time, and valid status are required.'},{status:400})
    const{data:season}=await supabaseAdmin.from('league_seasons').select('id').eq('id',seasonId).eq('league_id',leagueId).maybeSingle();if(!season)return NextResponse.json({error:'The selected season is outside this league.'},{status:403})
    const{data:teamRows}=await supabaseAdmin.from('league_team_assignments').select('team_id').eq('league_id',leagueId).eq('season_id',seasonId).eq('status','active').in('team_id',[homeTeamId,awayTeamId]);if(new Set((teamRows||[]).map(row=>row.team_id)).size!==2)return NextResponse.json({error:'Both teams must be active in the selected league season.'},{status:403})
    const payload={league_id:leagueId,season_id:seasonId,division_id:String(body?.division_id||'')||null,home_team_id:homeTeamId,away_team_id:awayTeamId,starts_at:startsAt,ends_at:String(body?.ends_at||'')||null,location:String(body?.location||'').trim()||null,venue_id:String(body?.venue_id||'')||null,status}
    const query=gameId?supabaseAdmin.from('league_games').update(payload).eq('id',gameId).eq('league_id',leagueId):supabaseAdmin.from('league_games').insert(payload)
    const{data,error}=await query.select('*').single();if(error)return NextResponse.json({error:leagueActionMessage(error,'The game could not be saved. Check for team or venue conflicts.')},{status:409});await audit(gameId?'league.game.updated':'league.game.created','league_game',data.id);return NextResponse.json({game:data},{status:gameId?200:201})
  }
  if(action==='save_venue'){
    if(!leagueCan(authority,'manage_schedule'))return NextResponse.json({error:'You do not have permission to manage venues.'},{status:403})
    const name=String(body?.name||'').trim();if(!name)return NextResponse.json({error:'Venue name is required.'},{status:400})
    const payload={league_id:leagueId,name,surface_name:String(body?.surface_name||'').trim()||null,address:String(body?.address||'').trim()||null,directions:String(body?.directions||'').trim()||null,is_active:body?.is_active!==false}
    const venueId=String(body?.venue_id||'').trim()
    const query=venueId?supabaseAdmin.from('league_venues').update(payload).eq('id',venueId).eq('league_id',leagueId):supabaseAdmin.from('league_venues').insert(payload)
    const{data,error}=await query.select('*').single();if(error)return NextResponse.json({error:'The venue could not be saved.'},{status:500});await audit(venueId?'league.venue.updated':'league.venue.created','league_venue',data.id);return NextResponse.json({venue:data},{status:venueId?200:201})
  }
  if(action==='submit_score'){
    if(!leagueCan(authority,'submit_scores')&&!leagueCan(authority,'manage_schedule'))return NextResponse.json({error:'You do not have permission to submit scores.'},{status:403})
    const gameId=String(body?.game_id||''),home=Number(body?.home_score),away=Number(body?.away_score);if(!gameId||!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0)return NextResponse.json({error:'Valid non-negative scores are required.'},{status:400})
    const{data:game}=await supabaseAdmin.from('league_games').select('id').eq('id',gameId).eq('league_id',leagueId).maybeSingle();if(!game)return NextResponse.json({error:'League game not found.'},{status:404})
    const{error}=await supabase.rpc('approve_league_game_result',{p_game_id:gameId,p_home_score:home,p_away_score:away,p_result_type:'played',p_note:'Finalized by league staff on the web.'});if(error)return NextResponse.json({error:leagueActionMessage(error,'The score could not be saved.')},{status:409});await notify({audience:'participants',type:'league_score_submitted',category:'results',title:'Final score posted',body:`Final score: ${home}-${away}`,destination:'/league/results',resourceId:game.id,state:`final:${home}:${away}`,data:{game_id:game.id}});return NextResponse.json({game_id:game.id})
  }
  if(action==='create_document'){
    if(!leagueCan(authority,'manage_documents'))return NextResponse.json({error:'You do not have permission to create document requests.'},{status:403})
    const title=String(body?.title||'').trim();if(!title)return NextResponse.json({error:'Document title is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_documents').insert({league_id:leagueId,season_id:body?.season_id||null,title,document_type:String(body?.document_type||'other'),target_type:String(body?.target_type||'organization'),due_at:body?.due_at||null,is_required:body?.is_required!==false,storage_path:body?.storage_path||null}).select('*').single();if(error)return NextResponse.json({error:'The document request could not be created. Please retry.'},{status:500});await audit('league.document.created','league_document',data.id);await notify({audience:'participants',type:'league_document_created',category:'documents',title:'League document required',body:title,destination:'/league/documents',resourceId:data.id,state:'created'});return NextResponse.json({document:data},{status:201})
  }
  if(action !== 'publish_announcement') return NextResponse.json({ error: 'That league action is unavailable.' }, { status: 400 })
  if (!leagueCan(authority, 'send_announcements')) return NextResponse.json({ error: 'You do not have permission to publish league announcements.' }, { status: 403 })
  const title = String(body?.title || '').trim(), message = String(body?.body || '').trim()
  if (!title || !message) return NextResponse.json({ error: 'A title and message are required.' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('league_announcements').insert({ league_id:leagueId, title, body:message, audience:String(body?.audience||'league'), audience_id:body?.audience_id||null, season_id:body?.season_id||null, created_by:session.user.id, published_at:new Date().toISOString() }).select('*').single()
  if (error) return NextResponse.json({ error: 'The announcement could not be published. Please retry.' }, { status: 500 })
  await audit('league.announcement.published','league_announcement',data.id,{audience:data.audience})
  await notify({audience:'participants',type:'league_announcement',category:'messages',title,body:message,destination:'/league/announcements',resourceId:data.id,state:'published'})
  return NextResponse.json({ announcement: data }, { status: 201 })
}
