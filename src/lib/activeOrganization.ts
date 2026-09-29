import { headers } from 'next/headers'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { normalizeUuid } from '@/lib/uuid'

export type ActiveOrganizationContext = {
  organizationId: string
  workspaceId: string
  role: string
  isActiveWorkspace: boolean
}

/** Compatibility adapter for organization routes using the authoritative workspace header. */
export async function resolveActiveOrganization(
  userId: string,
  options: { requestedWorkspaceId?: string | null; currentOrgId?: string | null } = {},
): Promise<ActiveOrganizationContext | null> {
  const requestedWorkspaceId = normalizeUuid(options.requestedWorkspaceId)
  if (!requestedWorkspaceId) return null
  const workspace = await requireWorkspaceContext(userId, requestedWorkspaceId)
  if (!workspace || workspace.type !== 'organization' || !workspace.organizationId) return null
  return {
    organizationId: workspace.organizationId,
    workspaceId: workspace.id,
    role: workspace.roles.find(role => role === 'org_admin')
      || workspace.roles.find(role => role === 'owner')
      || workspace.roles[0]
      || 'member',
    isActiveWorkspace: true,
  }
}

export async function resolveActiveOrganizationForUser(userId: string, requestedWorkspaceId?: string | null) {
  const requestHeaders = await headers()
  const workspaceId = requestedWorkspaceId ?? requestHeaders.get('x-workspace-id')
  return resolveActiveOrganization(userId, { requestedWorkspaceId: workspaceId })
}

export async function resolveActiveOrganizationId(userId: string, requestedWorkspaceId?: string | null) {
  return (await resolveActiveOrganizationForUser(userId, requestedWorkspaceId))?.organizationId || null
}
