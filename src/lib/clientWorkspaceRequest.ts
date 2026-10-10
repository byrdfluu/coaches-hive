import type { SupabaseClient } from '@supabase/supabase-js'

type WorkspaceChoice = {
  workspace_id?: string | null
  organization_id?: string | null
  roles?: string[] | null
}

const preferredRole = (roles: string[], activeRole?: string | null) => {
  if (activeRole && roles.includes(activeRole)) return activeRole
  return ['owner', 'org_admin', 'admin', 'program_director', 'team_manager', 'coach', 'assistant_coach']
    .find((role) => roles.includes(role)) || roles[0] || ''
}

export async function organizationWorkspaceHeaders(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Record<string, string>> {
  const [rolesResponse, sessionResult] = await Promise.all([
    fetch('/api/roles/available', { cache: 'no-store' }),
    supabase.auth.getSession(),
  ])
  const payload = await rolesResponse.json().catch(() => ({}))
  const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces as WorkspaceChoice[] : []
  const workspace = workspaces.find((item) =>
    item.workspace_id === payload?.active_workspace_id && item.organization_id === organizationId
  ) || workspaces.find((item) => item.organization_id === organizationId)
  if (!rolesResponse.ok || !workspace?.workspace_id) throw new Error('Organization workspace is unavailable.')
  const roles = Array.isArray(workspace.roles) ? workspace.roles.map(String) : []
  const actingRole = preferredRole(roles, String(payload?.active_role || ''))
  const accessToken = sessionResult.data.session?.access_token
  return {
    'X-Workspace-ID': workspace.workspace_id,
    ...(actingRole ? { 'X-Acting-Role': actingRole } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}
