import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const roleState = getSessionRoleState(session.user.user_metadata)
  const roles = new Set<string>(roleState.availableRoles)

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (membership?.role && membership.status !== 'suspended') {
    roles.add(membership.role)
  }

  const { data: leagueMemberships } = await supabaseAdmin.from('league_memberships')
    .select('league_id,role,status').eq('user_id', session.user.id).eq('status', 'active')
  for (const leagueMembership of leagueMemberships || []) {
    if (leagueMembership.role) roles.add(String(leagueMembership.role))
  }
  const { data: workspaceMemberships } = await supabaseAdmin.from('workspace_memberships')
    .select('workspace_id,roles,status,business_workspaces!inner(id,display_name,workspace_type,organization_id,owner_user_id,status)')
    .eq('user_id', session.user.id).eq('status', 'active')
  const leagueIds = (leagueMemberships || []).map((item) => item.league_id)
  const { data: leagues } = leagueIds.length
    ? await supabaseAdmin.from('leagues').select('id,name,sport,status').in('id', leagueIds).eq('status', 'active')
    : { data: [] }

  return NextResponse.json({
    base_role: roleState.baseRole,
    active_role: roleState.currentRole,
    roles: Array.from(roles),
    workspaces: workspaceMemberships || [],
    league_contexts: (leagueMemberships || []).map((item) => ({ ...item, league: (leagues || []).find((league) => league.id === item.league_id) || null })),
  })
}
