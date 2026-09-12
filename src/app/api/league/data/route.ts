import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { leagueCan, requireLeagueMembership } from '@/lib/leagueAuthority'

export const dynamic = 'force-dynamic'
const resources = { clubs:'league_organizations', divisions:'league_divisions', teams:'league_team_assignments', schedule:'league_games', registrations:'league_registrations', payments:'league_fee_assignments', documents:'league_documents', submissions:'league_document_submissions', announcements:'league_announcements', staff:'league_memberships', permissions:'league_permissions', seasons:'league_seasons', audit:'league_audit_events' } as const

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const url = new URL(request.url), resource = String(url.searchParams.get('resource') || '')
  if (!(resource in resources)) return NextResponse.json({ error: 'That league section is unavailable.' }, { status: 400 })
  const authority = await requireLeagueMembership(session.user.id, url.searchParams.get('league_id'))
  if (!authority) return NextResponse.json({ error: 'Your league access is no longer active.' }, { status: 403 })
  let query = supabaseAdmin.from(resources[resource as keyof typeof resources]).select('*').eq('league_id', authority.league_id).limit(500)
  if (resource === 'audit') query = query.order('occurred_at', { ascending: false })
  else if (resource === 'schedule') query = query.order('starts_at', { ascending: true })
  else if (resource === 'clubs') query = query.order('joined_at', { ascending: false })
  else query = query.order('created_at', { ascending: false })
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Unable to load this league section. Please retry.' }, { status: 500 })
  const rows = (data || []) as any[], profileIds = new Set<string>(), orgIds = new Set<string>(), teamIds = new Set<string>()
  for (const row of rows) {
    for (const key of ['user_id','athlete_id','submitted_by']) if (row[key]) profileIds.add(row[key])
    if (row.org_id) orgIds.add(row.org_id)
    for (const key of ['team_id','home_team_id','away_team_id']) if (row[key]) teamIds.add(row[key])
  }
  const [{ data: profiles }, { data: orgs }, { data: teams }] = await Promise.all([
    profileIds.size ? supabaseAdmin.from('profiles').select('id,full_name,avatar_url').in('id', Array.from(profileIds)) : Promise.resolve({ data: [] }),
    orgIds.size ? supabaseAdmin.from('org_settings').select('org_id,org_name,brand_logo_url').in('org_id', Array.from(orgIds)) : Promise.resolve({ data: [] }),
    teamIds.size ? supabaseAdmin.from('org_teams').select('id,name').in('id', Array.from(teamIds)) : Promise.resolve({ data: [] }),
  ])
  const enriched = rows.map(row => ({ ...row, user:(profiles||[]).find(p=>p.id===row.user_id)||null, athlete:(profiles||[]).find(p=>p.id===row.athlete_id)||null, organization:(orgs||[]).find(o=>o.org_id===row.org_id)||null, team:(teams||[]).find(t=>t.id===row.team_id)||null, home_team:(teams||[]).find(t=>t.id===row.home_team_id)||null, away_team:(teams||[]).find(t=>t.id===row.away_team_id)||null }))
  return NextResponse.json({ resource, league_id: authority.league_id, role: authority.role, can_manage: leagueCan(authority, `manage_${resource}`), rows: enriched })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null), leagueId = String(body?.league_id || ''), authority = await requireLeagueMembership(session.user.id, leagueId)
  if (!authority) return NextResponse.json({ error: 'Your league access is no longer active.' }, { status: 403 })
  const action=String(body?.action||'')
  const audit=async(eventType:string,recordType:string,recordId:string,metadata:Record<string,unknown>={})=>supabaseAdmin.from('league_audit_events').insert({league_id:leagueId,actor_user_id:session.user.id,event_type:eventType,record_type:recordType,record_id:recordId,metadata})
  if(action==='create_division'){
    if(!leagueCan(authority,'manage_divisions'))return NextResponse.json({error:'You do not have permission to manage divisions.'},{status:403})
    const name=String(body?.name||'').trim();if(!name)return NextResponse.json({error:'Division name is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_divisions').insert({league_id:leagueId,season_id:body?.season_id||null,name,age_group:String(body?.age_group||'')||null,competition_level:String(body?.competition_level||'')||null}).select('*').single();if(error)return NextResponse.json({error:'The division could not be created. Please retry.'},{status:500});await audit('league.division.created','league_division',data.id);return NextResponse.json({division:data},{status:201})
  }
  if(action==='create_season'){
    if(!leagueCan(authority,'manage_seasons'))return NextResponse.json({error:'You do not have permission to manage seasons.'},{status:403})
    const name=String(body?.name||'').trim();if(!name)return NextResponse.json({error:'Season name is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_seasons').insert({league_id:leagueId,name,start_date:body?.start_date||null,end_date:body?.end_date||null,is_active:Boolean(body?.is_active),registration_status:String(body?.registration_status||'closed')}).select('*').single();if(error)return NextResponse.json({error:'The season could not be created. Please retry.'},{status:500});await audit('league.season.created','league_season',data.id);return NextResponse.json({season:data},{status:201})
  }
  if(action==='submit_score'){
    if(!leagueCan(authority,'submit_scores'))return NextResponse.json({error:'You do not have permission to submit scores.'},{status:403})
    const gameId=String(body?.game_id||''),home=Number(body?.home_score),away=Number(body?.away_score);if(!gameId||!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0)return NextResponse.json({error:'Valid non-negative scores are required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_games').update({home_score:home,away_score:away,status:'completed',submitted_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',gameId).eq('league_id',leagueId).select('*').single();if(error)return NextResponse.json({error:'The score could not be saved. Please retry.'},{status:500});await audit('league.game.score_submitted','league_game',data.id,{home_score:home,away_score:away});return NextResponse.json({game:data})
  }
  if(action==='create_document'){
    if(!leagueCan(authority,'manage_documents'))return NextResponse.json({error:'You do not have permission to create document requests.'},{status:403})
    const title=String(body?.title||'').trim();if(!title)return NextResponse.json({error:'Document title is required.'},{status:400})
    const{data,error}=await supabaseAdmin.from('league_documents').insert({league_id:leagueId,season_id:body?.season_id||null,title,document_type:String(body?.document_type||'other'),target_type:String(body?.target_type||'organization'),due_at:body?.due_at||null,is_required:body?.is_required!==false,storage_path:body?.storage_path||null}).select('*').single();if(error)return NextResponse.json({error:'The document request could not be created. Please retry.'},{status:500});await audit('league.document.created','league_document',data.id);return NextResponse.json({document:data},{status:201})
  }
  if(action !== 'publish_announcement') return NextResponse.json({ error: 'That league action is unavailable.' }, { status: 400 })
  if (!leagueCan(authority, 'manage_announcements')) return NextResponse.json({ error: 'You do not have permission to publish league announcements.' }, { status: 403 })
  const title = String(body?.title || '').trim(), message = String(body?.body || '').trim()
  if (!title || !message) return NextResponse.json({ error: 'A title and message are required.' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('league_announcements').insert({ league_id:leagueId, title, body:message, audience:String(body?.audience||'league'), audience_id:body?.audience_id||null, season_id:body?.season_id||null, created_by:session.user.id, published_at:new Date().toISOString() }).select('*').single()
  if (error) return NextResponse.json({ error: 'The announcement could not be published. Please retry.' }, { status: 500 })
  await audit('league.announcement.published','league_announcement',data.id,{audience:data.audience})
  return NextResponse.json({ announcement: data }, { status: 201 })
}
