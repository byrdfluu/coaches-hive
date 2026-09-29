import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUuid } from '@/lib/uuid'

export type WorkspaceContext = {
  id: string
  type: 'organization' | 'independent_coach' | 'league'
  organizationId: string | null
  leagueId: string | null
  ownerUserId: string | null
  roles: string[]
  permissions: Record<string, boolean>
}

export type WorkspaceTenantInput = {
  workspace_id?: unknown
  organization_id?: unknown
  org_id?: unknown
  league_id?: unknown
}

export type WorkspaceAuthorityFailure =
  | 'workspace_header_required'
  | 'workspace_not_found'
  | 'workspace_forbidden'
  | 'workspace_context_mismatch'
  | 'workspace_type_mismatch'

export type WorkspaceAuthorityResult =
  | { ok: true; workspace: WorkspaceContext }
  | { ok: false; code: WorkspaceAuthorityFailure; status: 400 | 403 | 404 | 409 }

export function workspaceTenantInputMatches(workspace: WorkspaceContext, body?: WorkspaceTenantInput | null) {
  const suppliedWorkspaceId = normalizeUuid(body?.workspace_id)
  const suppliedOrganizationId = normalizeUuid(body?.organization_id)
  const suppliedLegacyOrgId = normalizeUuid(body?.org_id)
  const suppliedLeagueId = normalizeUuid(body?.league_id)
  return !(
    (suppliedWorkspaceId && suppliedWorkspaceId !== normalizeUuid(workspace.id))
    || (suppliedOrganizationId && suppliedOrganizationId !== normalizeUuid(workspace.organizationId))
    || (suppliedLegacyOrgId && suppliedLegacyOrgId !== normalizeUuid(workspace.organizationId))
    || (suppliedLeagueId && suppliedLeagueId !== normalizeUuid(workspace.leagueId))
  )
}

export async function loadWorkspaceContext(workspaceId: string): Promise<WorkspaceContext | null> {
  const normalizedId = normalizeUuid(workspaceId)
  if (!normalizedId) return null
  const { data: workspace } = await supabaseAdmin.from('business_workspaces')
    .select('id,workspace_type,organization_id,league_id,owner_user_id,status')
    .eq('id', normalizedId)
    .maybeSingle()
  if (!workspace || workspace.status !== 'active') return null
  return {
    id: workspace.id,
    type: workspace.workspace_type,
    organizationId: workspace.organization_id || null,
    leagueId: workspace.league_id || null,
    ownerUserId: workspace.owner_user_id || null,
    roles: [],
    permissions: {},
  }
}

export async function requireWorkspaceContext(userId: string, requestedWorkspaceId?: unknown): Promise<WorkspaceContext | null> {
  const workspaceId = normalizeUuid(requestedWorkspaceId)
  if (!workspaceId) return null
  const { data: membership } = await supabaseAdmin.from('workspace_memberships')
    .select('roles,permissions,status,business_workspaces!inner(id,workspace_type,organization_id,league_id,owner_user_id,status)')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  const raw = Array.isArray((membership as any)?.business_workspaces)
    ? (membership as any).business_workspaces[0]
    : (membership as any)?.business_workspaces
  if (!raw || raw.status !== 'active') return null
  return {
    id: raw.id,
    type: raw.workspace_type,
    organizationId: raw.organization_id || null,
    leagueId: raw.league_id || null,
    ownerUserId: raw.owner_user_id || null,
    roles: Array.isArray(membership?.roles) ? membership!.roles.map(String) : [],
    permissions: membership?.permissions && typeof membership.permissions === 'object' ? membership.permissions as Record<string, boolean> : {},
  }
}

/**
 * Canonical authority boundary for authenticated, workspace-scoped requests.
 * The header selects the tenant. Body tenant fields are assertions only.
 */
export async function authorizeWorkspaceRequest(input: {
  request: Request
  userId: string
  body?: WorkspaceTenantInput | null
  expectedType?: WorkspaceContext['type']
  allowWithoutMembership?: boolean
}): Promise<WorkspaceAuthorityResult> {
  const workspaceId = normalizeUuid(input.request.headers.get('x-workspace-id'))
  if (!workspaceId) return { ok: false, code: 'workspace_header_required', status: 400 }

  const loaded = await loadWorkspaceContext(workspaceId)
  if (!loaded) return { ok: false, code: 'workspace_not_found', status: 404 }
  if (input.expectedType && loaded.type !== input.expectedType) {
    return { ok: false, code: 'workspace_type_mismatch', status: 409 }
  }

  if (!workspaceTenantInputMatches(loaded, input.body)) {
    return { ok: false, code: 'workspace_context_mismatch', status: 409 }
  }

  const workspace = await requireWorkspaceContext(input.userId, workspaceId)
  if (!workspace) {
    return input.allowWithoutMembership
      ? { ok: true, workspace: loaded }
      : { ok: false, code: 'workspace_forbidden', status: 403 }
  }
  return { ok: true, workspace }
}

export function logWorkspaceAuthority(input: {
  requestId: string
  userId: string
  request: Request
  route: string
  body?: WorkspaceTenantInput | null
  result: WorkspaceAuthorityResult
}) {
  const workspace = input.result.ok ? input.result.workspace : null
  console.info('[workspace/authority]', {
    request_id: input.requestId,
    authenticated_user_id: input.userId,
    x_workspace_id: normalizeUuid(input.request.headers.get('x-workspace-id')) || null,
    resolved_workspace_type: workspace?.type || null,
    resolved_organization_id: workspace?.organizationId || null,
    resolved_league_id: workspace?.leagueId || null,
    supplied_body_workspace_id: normalizeUuid(input.body?.workspace_id) || null,
    supplied_body_organization_id: normalizeUuid(input.body?.organization_id) || null,
    supplied_body_org_id: normalizeUuid(input.body?.org_id) || null,
    supplied_body_league_id: normalizeUuid(input.body?.league_id) || null,
    authorization_result: input.result.ok ? 'authorized' : input.result.code,
    route: input.route,
  })
}

export const workspaceCan = (workspace: WorkspaceContext, permission: string) =>
  workspace.roles.some(role => ['owner', 'org_admin'].includes(role)) || workspace.permissions[permission] === true

export async function recordBelongsToWorkspace(table: string, recordId: string, workspaceId: string) {
  const { data, error } = await supabaseAdmin.from(table).select('id,workspace_id').eq('id', recordId).maybeSingle()
  return !error && normalizeUuid(data?.workspace_id) === normalizeUuid(workspaceId)
}
