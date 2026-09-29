import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import {
  getPlatformSubscriptionSnapshot,
  resolvePlatformActorForWorkspace,
} from '@/lib/platformSubscription'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { normalizeUuid } from '@/lib/uuid'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return correlatedError(requestId, 'unauthorized', 'Authentication is required.', 401, false)
  const headerWorkspaceId = normalizeUuid(request.headers.get('x-workspace-id'))
  const queryWorkspaceId = normalizeUuid(new URL(request.url).searchParams.get('workspace_id'))
  if (!headerWorkspaceId) return correlatedError(requestId, 'workspace_header_required', 'X-Workspace-ID is required.', 400, false)
  if (queryWorkspaceId && queryWorkspaceId !== headerWorkspaceId) {
    return correlatedError(requestId, 'workspace_context_mismatch', 'The selected workspace does not match the request.', 409, false)
  }
  const workspaceId = headerWorkspaceId
  const workspace = await requireWorkspaceContext(user.id, workspaceId)
  if (!workspace) return correlatedError(requestId, 'workspace_forbidden', 'You do not have access to this workspace.', 403, false)
  const actor = await resolvePlatformActorForWorkspace(user.id, workspaceId)
  if (!actor) return correlatedError(requestId, 'workspace_forbidden', 'You do not have access to this workspace.', 403, false)
  const snapshot = await getPlatformSubscriptionSnapshot(actor)
  const { data: memberships } = await supabaseAdmin.from('workspace_memberships')
    .select('roles,permissions,status,business_workspaces!inner(id,workspace_type,display_name,organization_id,status)')
    .eq('user_id', user.id).eq('status', 'active')
  const workspaces = (memberships || []).map((membership: any) => {
    const workspace = Array.isArray(membership.business_workspaces) ? membership.business_workspaces[0] : membership.business_workspaces
    return { workspace_id: workspace?.id, workspace_type: workspace?.workspace_type, display_name: workspace?.display_name,
      organization_id: workspace?.organization_id, roles: membership.roles || [], permissions: membership.permissions || {} }
  }).filter((workspace: any) => workspace.workspace_id)
  console.info('[mobile/subscription/status] resolved', {
    request_id: requestId, authenticated_user_id: user.id, header_workspace_id: headerWorkspaceId,
    saved_subscription_workspace_id: workspaceId, organization_id: workspace.organizationId,
    plan_key: snapshot.plan_key || null, stripe_subscription_status: snapshot.status,
    stripe_subscription_id: snapshot.stripe_subscription_id || null, final_has_access: snapshot.has_access,
  })
  return NextResponse.json({ ...snapshot, workspace_id: workspaceId,
    organization_id: workspace.organizationId, active_workspace_id: workspaceId, workspaces }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Coaches-Hive-Support-Reference': requestId },
  })
}
