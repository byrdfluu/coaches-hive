import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type WorkspaceContext = {
  id: string
  type: 'organization' | 'independent_coach'
  organizationId: string | null
  ownerUserId: string | null
  roles: string[]
  permissions: Record<string, boolean>
}

export async function requireWorkspaceContext(userId: string, requestedWorkspaceId?: unknown): Promise<WorkspaceContext | null> {
  let workspaceId = typeof requestedWorkspaceId === 'string' ? requestedWorkspaceId.trim() : ''
  if (!workspaceId) {
    const { data: preference } = await supabaseAdmin.from('active_workspace_preferences')
      .select('workspace_id').eq('user_id', userId).maybeSingle()
    workspaceId = String(preference?.workspace_id || '')
  }
  if (!workspaceId) return null
  const { data: membership } = await supabaseAdmin.from('workspace_memberships')
    .select('roles,permissions,status,business_workspaces!inner(id,workspace_type,organization_id,owner_user_id,status)')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  const raw = Array.isArray((membership as any)?.business_workspaces)
    ? (membership as any).business_workspaces[0]
    : (membership as any)?.business_workspaces
  if (!raw || raw.status === 'archived') return null
  return {
    id: raw.id,
    type: raw.workspace_type,
    organizationId: raw.organization_id || null,
    ownerUserId: raw.owner_user_id || null,
    roles: Array.isArray(membership?.roles) ? membership!.roles.map(String) : [],
    permissions: membership?.permissions && typeof membership.permissions === 'object' ? membership.permissions as Record<string, boolean> : {},
  }
}

export const workspaceCan = (workspace: WorkspaceContext, permission: string) =>
  workspace.roles.some(role => ['owner', 'org_admin'].includes(role)) || workspace.permissions[permission] === true

export async function recordBelongsToWorkspace(table: string, recordId: string, workspaceId: string) {
  const { data, error } = await supabaseAdmin.from(table).select('id,workspace_id').eq('id', recordId).maybeSingle()
  return !error && data?.workspace_id === workspaceId
}
