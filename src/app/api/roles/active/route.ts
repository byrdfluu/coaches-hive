import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { getSessionRoleState } from '@/lib/sessionRoleState'
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

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role, status')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (membership?.role && membership.status !== 'suspended') {
    allowedRoles.add(membership.role)
  }

  if (!allowedRoles.has(nextRole)) {
    return jsonError('Role not allowed', 403)
  }

  const roles = Array.from(new Set([...roleState.availableRoles, ...Array.from(allowedRoles)]))
  const previousActiveRole = roleState.currentRole

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      active_role: nextRole,
      roles,
      ...(membership?.org_id && nextRole === membership.role ? { current_org_id: membership.org_id } : {}),
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
