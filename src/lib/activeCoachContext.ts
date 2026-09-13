import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type ActiveCoachContext = {
  workspaceId: string | null
  organizationId: string | null
  teamId: string | null
  independent: boolean
}

export async function resolveActiveCoachContext(userId: string): Promise<ActiveCoachContext> {
  const [{ data: authData }, { data: preference }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('active_workspace_preferences').select('workspace_id,acting_role').eq('user_id', userId).maybeSingle(),
  ])
  const metadata = authData.user?.user_metadata || {}
  // The database preference is shared with iOS and is authoritative. Auth
  // metadata can lag behind after a mobile workspace switch.
  const workspaceId = String(preference?.workspace_id || metadata.active_workspace_id || '') || null
  const selectedTeamId = String(metadata.selected_coach_team_id || '') || null
  if (!workspaceId) return { workspaceId: null, organizationId: null, teamId: null, independent: true }

  const { data: membership } = await supabaseAdmin.from('workspace_memberships')
    .select('roles,status,business_workspaces!inner(workspace_type,organization_id,status)')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  const workspace = Array.isArray((membership as any)?.business_workspaces)
    ? (membership as any).business_workspaces[0]
    : (membership as any)?.business_workspaces
  const membershipRoles = membership?.roles
  if (!workspace || workspace.status === 'archived' || !Array.isArray(membershipRoles) || !membershipRoles.some(role => ['coach', 'assistant_coach', 'owner'].includes(role))) {
    return { workspaceId: null, organizationId: null, teamId: null, independent: true }
  }
  if (workspace.workspace_type !== 'organization' || !workspace.organization_id) {
    return { workspaceId, organizationId: null, teamId: null, independent: true }
  }
  let teamId: string | null = null
  if (selectedTeamId) {
    const { data: assignment } = await supabaseAdmin.from('org_team_coaches').select('team_id,org_teams!inner(org_id)')
      .eq('coach_id', userId).eq('team_id', selectedTeamId).eq('org_teams.org_id', workspace.organization_id).maybeSingle()
    if (assignment) teamId = selectedTeamId
  }
  return { workspaceId, organizationId: workspace.organization_id, teamId, independent: false }
}
