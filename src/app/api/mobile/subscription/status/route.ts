import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import {
  getPlatformSubscriptionSnapshot,
  resolvePlatformActorForWorkspace,
} from '@/lib/platformSubscription'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeWorkspaceRequest, logWorkspaceAuthority } from '@/lib/workspaceAuthority'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return correlatedError(requestId, 'unauthorized', 'Authentication is required.', 401, false)
  const body = { workspace_id: new URL(request.url).searchParams.get('workspace_id') }
  const authority = await authorizeWorkspaceRequest({ request, userId: user.id, body })
  logWorkspaceAuthority({ requestId, userId: user.id, request, route: 'GET /api/mobile/subscription/status', body, result: authority })
  if (!authority.ok) return correlatedError(requestId, authority.code, 'The selected workspace could not be authorized.', authority.status, false)
  const workspace = authority.workspace
  const workspaceId = workspace.id
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
    request_id: requestId, authenticated_user_id: user.id, header_workspace_id: workspaceId,
    saved_subscription_workspace_id: workspaceId, organization_id: workspace.organizationId,
    plan_key: snapshot.plan_key || null, stripe_subscription_status: snapshot.status,
    has_stripe_subscription: Boolean(snapshot.stripe_subscription_id), final_has_access: snapshot.has_access,
  })
  const {
    stripe_customer_id: _stripeCustomerId,
    stripe_subscription_id: _stripeSubscriptionId,
    stripe_price_id: _stripePriceId,
    ...publicSnapshot
  } = snapshot
  return NextResponse.json({ ...publicSnapshot, workspace_id: workspaceId,
    organization_id: workspace.organizationId, active_workspace_id: workspaceId, workspaces }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Coaches-Hive-Support-Reference': requestId },
  })
}
