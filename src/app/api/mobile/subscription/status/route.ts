import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import {
  emptyPlatformSubscriptionSnapshot,
  getPlatformSubscriptionSnapshot,
  resolvePlatformActorForWorkspace,
} from '@/lib/platformSubscription'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const workspaceId = new URL(request.url).searchParams.get('workspace_id')
  const actor = await resolvePlatformActorForWorkspace(user.id, workspaceId)
  if (!actor) return NextResponse.json(emptyPlatformSubscriptionSnapshot())
  const snapshot = await getPlatformSubscriptionSnapshot(actor)
  const { data: memberships } = await supabaseAdmin.from('workspace_memberships')
    .select('roles,permissions,status,business_workspaces!inner(id,workspace_type,display_name,organization_id,status)')
    .eq('user_id', user.id).eq('status', 'active')
  const workspaces = (memberships || []).map((membership: any) => {
    const workspace = Array.isArray(membership.business_workspaces) ? membership.business_workspaces[0] : membership.business_workspaces
    return { workspace_id: workspace?.id, workspace_type: workspace?.workspace_type, display_name: workspace?.display_name,
      organization_id: workspace?.organization_id, roles: membership.roles || [], permissions: membership.permissions || {} }
  }).filter((workspace: any) => workspace.workspace_id)
  return NextResponse.json({ ...snapshot, active_workspace_id: workspaceId || null, workspaces })
}
