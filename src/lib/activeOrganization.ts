import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type ActiveOrganizationContext = {
  organizationId: string
  workspaceId: string | null
  role: string
  isActiveWorkspace: boolean
}

/**
 * Resolves an organization from an explicit, authorized selection. The active
 * workspace preference is shared with iOS; current_org_id is retained as a
 * compatibility fallback for existing web sessions.
 */
export async function resolveActiveOrganization(
  userId: string,
  options: { requestedWorkspaceId?: string | null; currentOrgId?: string | null } = {},
): Promise<ActiveOrganizationContext | null> {
  const requestedWorkspaceId = String(options.requestedWorkspaceId || '').trim()
  const currentOrgId = String(options.currentOrgId || '').trim()

  const { data: memberships } = await supabaseAdmin
    .from('workspace_memberships')
    .select('workspace_id,roles,status,business_workspaces!inner(id,workspace_type,organization_id,status)')
    .eq('user_id', userId)
    .eq('status', 'active')

  const organizationWorkspaces = (memberships || []).flatMap((membership: any) => {
    const workspace = Array.isArray(membership.business_workspaces)
      ? membership.business_workspaces[0]
      : membership.business_workspaces
    if (!workspace || workspace.status === 'archived' || workspace.workspace_type !== 'organization' || !workspace.organization_id) return []
    return [{
      organizationId: String(workspace.organization_id),
      workspaceId: String(workspace.id || membership.workspace_id),
      roles: Array.isArray(membership.roles) ? membership.roles.map(String) : [],
    }]
  })

  const { data: preference } = await supabaseAdmin
    .from('active_workspace_preferences')
    .select('workspace_id,acting_role')
    .eq('user_id', userId)
    .maybeSingle()

  const selected = organizationWorkspaces.find(item => item.workspaceId === requestedWorkspaceId)
    || organizationWorkspaces.find(item => item.workspaceId === preference?.workspace_id)
    || organizationWorkspaces.find(item => item.organizationId === currentOrgId)

  if (selected) {
    return {
      organizationId: selected.organizationId,
      workspaceId: selected.workspaceId,
      role: selected.roles.includes(String(preference?.acting_role))
        ? String(preference?.acting_role)
        : selected.roles.find((role: string) => role === 'org_admin')
          || selected.roles.find((role: string) => role === 'owner')
          || selected.roles[0]
          || 'member',
      isActiveWorkspace: selected.workspaceId === preference?.workspace_id,
    }
  }

  // Legacy organizations may predate workspace backfill. Keep the fallback
  // authorized and deterministic rather than using maybeSingle across rows.
  let legacyQuery = supabaseAdmin
    .from('organization_memberships')
    .select('org_id,role,status,created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (currentOrgId) legacyQuery = legacyQuery.eq('org_id', currentOrgId)
  const { data: legacyMemberships } = await legacyQuery.order('created_at', { ascending: false }).limit(1)
  const legacy = legacyMemberships?.[0]
  return legacy?.org_id
    ? { organizationId: legacy.org_id, workspaceId: null, role: legacy.role || 'member', isActiveWorkspace: false }
    : null
}

export async function resolveActiveOrganizationForUser(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  return resolveActiveOrganization(userId, {
    currentOrgId: String(data.user?.user_metadata?.current_org_id || ''),
  })
}

export async function resolveActiveOrganizationId(userId: string) {
  return (await resolveActiveOrganizationForUser(userId))?.organizationId || null
}
