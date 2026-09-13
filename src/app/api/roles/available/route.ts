import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const sharedSupabase = asSharedSupabaseClient(supabase)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const roleState = getSessionRoleState(session.user.user_metadata)
  const roles = new Set<string>(roleState.availableRoles)

  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('role, status')
    .eq('user_id', session.user.id)
    .eq('status', 'active')

  for (const membership of memberships || []) {
    if (membership?.role) roles.add(membership.role)
  }

  const [
    { data: workspaceMemberships, error: workspaceError },
    { data: leagueContexts, error: leagueError },
    { data: athleteProfiles, error: athleteError },
    { data: coachTeamContexts, error: coachTeamError },
  ] = await Promise.all([
    sharedSupabase.rpc('available_workspaces'),
    sharedSupabase.rpc('my_league_contexts'),
    sharedSupabase.rpc('my_accessible_athlete_profiles'),
    sharedSupabase.rpc('my_coach_team_contexts'),
  ])
  if (workspaceError || leagueError || athleteError || coachTeamError) return jsonError('Unable to load authorized profiles and workspaces. Please retry.', 500)
  for (const workspace of (workspaceMemberships || []) as Array<{ roles?: string[] }>) {
    for (const role of workspace.roles || []) roles.add(String(role))
  }
  for (const leagueContext of (leagueContexts || []) as Array<{ role?: string }>) {
    if (leagueContext.role) roles.add(String(leagueContext.role))
  }
  if ((athleteProfiles || []).length > 0) roles.add('athlete')

  return NextResponse.json({
    base_role: roleState.baseRole,
    active_role: roleState.currentRole,
    roles: Array.from(roles),
    workspaces: workspaceMemberships || [],
    active_workspace_id: (workspaceMemberships || []).find(workspace => workspace.is_last_used)?.workspace_id
      || (roleState.currentOrgId ? (workspaceMemberships || []).find(workspace => workspace.organization_id === roleState.currentOrgId)?.workspace_id : null)
      || null,
    league_contexts: leagueContexts || [],
    athlete_profiles: athleteProfiles || [],
    coach_team_contexts: coachTeamContexts || [],
    selected_athlete_profile_id: session.user.user_metadata?.selected_athlete_profile_id || null,
    selected_coach_team_id: session.user.user_metadata?.selected_coach_team_id || null,
  })
}
