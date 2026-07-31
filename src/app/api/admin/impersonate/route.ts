import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
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

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'support' && adminAccess.teamRole !== 'superadmin') {
    return jsonError('Forbidden', 403)
  }

  const body = await request.json().catch(() => null)
  const { user_id, role: targetRole } = body || {}

  if (
    !user_id ||
    ![
      'coach',
      'athlete',
      'org_admin',
      'club_admin',
      'travel_admin',
      'school_admin',
      'athletic_director',
      'program_director',
      'team_manager',
    ].includes(targetRole)
  ) {
    return jsonError('user_id and role are required')
  }

  // Verify the target user exists and actually holds a role compatible with the requested impersonation role.
  const { data: targetUserData, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(user_id)
  if (targetUserError || !targetUserData?.user) {
    return jsonError('Target user not found', 404)
  }
  const targetMeta = (targetUserData.user.user_metadata || {}) as Record<string, unknown>
  const actualUserRole = String(targetMeta.role || '').trim()
  const ORG_ROLE_SET = new Set([
    'org_admin', 'club_admin', 'travel_admin', 'school_admin',
    'athletic_director', 'program_director', 'team_manager',
  ])
  // For org impersonation, any org role in metadata is acceptable.
  const requestedRoleIsOrg = ORG_ROLE_SET.has(targetRole)
  const actualRoleIsOrg = ORG_ROLE_SET.has(actualUserRole)
  const roleCompatible = requestedRoleIsOrg ? actualRoleIsOrg : actualUserRole === targetRole
  if (!roleCompatible) {
    return jsonError(`Target user has role '${actualUserRole}', not '${targetRole}'`, 409)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ch_impersonate_user', user_id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 2,
  })
  res.cookies.set('ch_impersonate_role', targetRole, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 2,
  })
  await logAdminAction({
    action: 'admin.impersonate.start',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'user',
    targetId: user_id,
    metadata: { role: targetRole },
  })
  return res
}
