import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { logAdminAction } from '@/lib/auditLog'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { loadAuthorizedContexts } from '@/lib/authorizedContexts'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const body = await request.json().catch(() => ({}))
  const nextRole = String(body?.role || '').trim()
  if (!nextRole) return jsonError('role is required')

  const roleState = getSessionRoleState(session.user.user_metadata)
  const allowedRoles = new Set<string>(roleState.availableRoles)

  let contexts
  try {
    contexts = await loadAuthorizedContexts(supabase)
  } catch {
    return jsonError('Unable to verify your authorized roles.', 500)
  }
  for (const workspace of contexts.workspaces) {
    for (const role of workspace.roles || []) allowedRoles.add(String(role))
  }
  for (const league of contexts.leagues) if (league.role) allowedRoles.add(String(league.role))

  if (!allowedRoles.has(nextRole)) {
    return jsonError('Role not allowed', 403)
  }

  const roles = Array.from(new Set([...roleState.availableRoles, ...Array.from(allowedRoles)]))
  const previousActiveRole = roleState.currentRole
  const workspace = contexts.workspaces.find(item => (item.roles || []).includes(nextRole))
  const league = contexts.leagues.find(item => item.role === nextRole)

  if (workspace) {
    const { error: workspaceError } = await supabase.rpc('set_active_workspace', {
      p_workspace_id: workspace.workspace_id,
      p_acting_role: nextRole,
    })
    if (workspaceError) return jsonError('Unable to activate the requested workspace.', 500)
  }

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      active_role: nextRole,
      roles,
      ...(workspace?.organization_id ? { current_org_id: workspace.organization_id } : {}),
      ...(workspace?.workspace_id ? { active_workspace_id: workspace.workspace_id } : {}),
      ...(league?.league_id ? { current_league_id: league.league_id } : {}),
    },
  })
  if (updateError) {
    return jsonError(updateError.message || 'Unable to activate the requested role.', 500)
  }

  await logAdminAction({
    action: 'user.role_switch',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'user',
    targetId: session.user.id,
    metadata: {
      from: previousActiveRole,
      to: nextRole,
      base_role: roleState.baseRole,
      roles,
    },
  })

  return NextResponse.json({ active_role: nextRole, roles })
}
