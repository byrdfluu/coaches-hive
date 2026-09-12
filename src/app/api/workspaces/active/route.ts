import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { roleToPath } from '@/lib/roleRedirect'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const sharedSupabase = asSharedSupabaseClient(supabase)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const workspaceId = String(body?.workspace_id || '')
  const leagueId = String(body?.league_id || '')
  if (leagueId) {
    const { data: contexts, error: contextError } = await sharedSupabase.rpc('my_league_contexts')
    if (contextError) return NextResponse.json({ error: 'Unable to verify league access. Please retry.' }, { status: 500 })
    const context = ((contexts || []) as Array<{ league_id:string; role:string }>).find(item => item.league_id === leagueId)
    if (!context) return NextResponse.json({ error: 'That league is no longer available to your account.' }, { status: 403 })
    const { error } = await supabase.auth.updateUser({ data: { ...session.user.user_metadata, active_role: context.role, current_league_id: leagueId } })
    if (error) return NextResponse.json({ error: 'Unable to switch leagues. Please retry.' }, { status: 500 })
    return NextResponse.json({ next_path: '/league' })
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
  const { error: switchError } = await sharedSupabase.rpc('set_active_workspace', { p_workspace_id: workspaceId, p_acting_role: role })
  if (switchError) return NextResponse.json({ error: 'Unable to switch workspaces. Please retry.' }, { status: 500 })
  const { error } = await supabase.auth.updateUser({ data: { ...session.user.user_metadata, active_role: role, ...(workspace.organization_id ? { current_org_id: workspace.organization_id } : {}) } })
  if (error) return NextResponse.json({ error: 'Unable to switch workspaces. Please retry.' }, { status: 500 })
  return NextResponse.json({ next_path: roleToPath(role) })
}
