import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { roleToPath } from '@/lib/roleRedirect'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function clearActiveBusinessWorkspace(userId: string) {
  return supabaseAdmin.from('active_workspace_preferences').delete().eq('user_id', userId)
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const sharedSupabase = asSharedSupabaseClient(supabase)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const workspaceId = String(body?.workspace_id || '')
  const leagueId = String(body?.league_id || '')
  const athleteProfileId = String(body?.athlete_profile_id || '')
  const coachTeamId = String(body?.coach_team_id || '')
  if (leagueId) {
    const { data: contexts, error: contextError } = await sharedSupabase.rpc('my_league_contexts')
    if (contextError) return NextResponse.json({ error: 'Unable to verify league access. Please retry.' }, { status: 500 })
    const context = ((contexts || []) as Array<{ league_id:string; role:string }>).find(item => item.league_id === leagueId)
    if (!context) return NextResponse.json({ error: 'That league is no longer available to your account.' }, { status: 403 })
    const { error: preferenceError } = await clearActiveBusinessWorkspace(session.user.id)
    if (preferenceError) return NextResponse.json({ error: 'Unable to switch leagues. Please retry.' }, { status: 500 })
    const { error } = await supabase.auth.updateUser({ data: {
      ...session.user.user_metadata,
      active_role: context.role,
      active_workspace_id: null,
      current_org_id: null,
      current_league_id: leagueId,
      selected_athlete_profile_id: null,
      selected_coach_team_id: null,
    } })
    if (error) return NextResponse.json({ error: 'Unable to switch leagues. Please retry.' }, { status: 500 })
    return NextResponse.json({ next_path: '/league' })
  }

  if (athleteProfileId) {
    const { data: profiles, error: profileError } = await sharedSupabase.rpc('my_accessible_athlete_profiles')
    if (profileError) return NextResponse.json({ error: 'Unable to verify athlete access. Please retry.' }, { status: 500 })
    if (!(profiles || []).some(profile => profile.id === athleteProfileId)) {
      return NextResponse.json({ error: 'That athlete profile is no longer available to your account.' }, { status: 403 })
    }
    const metadataRoles = Array.isArray(session.user.user_metadata?.roles)
      ? session.user.user_metadata.roles.map(String)
      : []
    const { error: preferenceError } = await clearActiveBusinessWorkspace(session.user.id)
    if (preferenceError) return NextResponse.json({ error: 'Unable to switch athlete profiles. Please retry.' }, { status: 500 })
    const { error } = await supabase.auth.updateUser({ data: {
      ...session.user.user_metadata,
      roles: Array.from(new Set([...metadataRoles, 'athlete'])),
      active_role: 'athlete',
      active_workspace_id: null,
      current_org_id: null,
      current_league_id: null,
      selected_athlete_profile_id: athleteProfileId,
      selected_coach_team_id: null,
    } })
    if (error) return NextResponse.json({ error: 'Unable to switch athlete profiles. Please retry.' }, { status: 500 })
    return NextResponse.json({ next_path: '/athlete/dashboard' })
  }
  const { data: workspaces, error: workspaceError } = await sharedSupabase.rpc('available_workspaces')
  if (workspaceError) return NextResponse.json({ error: 'Unable to verify workspace access. Please retry.' }, { status: 500 })
  const workspace = ((workspaces || []) as Array<{ workspace_id:string; workspace_type:string; organization_id?:string|null; roles?:string[] }>).find(item => item.workspace_id === workspaceId)
  if (!workspace) return NextResponse.json({ error: 'That workspace is no longer available to your account.' }, { status: 403 })
  const requestedRole = String(body?.acting_role || '')
  const roles = workspace.roles || []
  const role = requestedRole && roles.includes(requestedRole)
    ? requestedRole
    : workspace.workspace_type === 'organization' && roles.includes('org_admin') ? 'org_admin'
      : roles.includes('coach') ? 'coach' : roles[0] || 'athlete'

  if (coachTeamId) {
    if (!roles.some(item => item === 'coach' || item === 'assistant_coach')) return NextResponse.json({ error: 'Coach access is not assigned in this workspace.' }, { status: 403 })
    const { data: teamContexts, error: teamError } = await sharedSupabase.rpc('my_coach_team_contexts')
    if (teamError) return NextResponse.json({ error: 'Unable to verify team access. Please retry.' }, { status: 500 })
    if (!(teamContexts || []).some(team => team.workspace_id === workspaceId && team.team_id === coachTeamId)) {
      return NextResponse.json({ error: 'That team is no longer available to your coach profile.' }, { status: 403 })
    }
  }
  const { error: switchError } = await sharedSupabase.rpc('set_active_workspace', { p_workspace_id: workspaceId, p_acting_role: role })
  if (switchError) return NextResponse.json({ error: 'Unable to switch workspaces. Please retry.' }, { status: 500 })
  const nextMetadata = {
    ...session.user.user_metadata,
    active_role: role,
    active_workspace_id: workspaceId,
    current_org_id: workspace.organization_id || null,
    current_league_id: null,
    selected_athlete_profile_id: null,
    selected_coach_team_id: coachTeamId || null,
  }
  const { error } = await supabase.auth.updateUser({ data: nextMetadata })
  if (error) return NextResponse.json({ error: 'Unable to switch workspaces. Please retry.' }, { status: 500 })
  const nextPath = workspace.workspace_type === 'independent_coach'
    ? '/coach/dashboard'
    : workspace.workspace_type === 'organization' && role === 'owner'
      ? '/org'
      : roleToPath(role)
  return NextResponse.json({ next_path: nextPath })
}
