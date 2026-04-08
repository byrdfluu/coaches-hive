import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { hasAdminPermission, normalizeAdminTeamRole, resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const updateUserMetadata = async (userId: string, patch: Record<string, any>) => {
  const { data: existing, error: loadError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (loadError || !existing?.user) {
    return { user: null, error: loadError || new Error('User not found') }
  }
  const metadata = { ...((existing.user.user_metadata || {}) as Record<string, any>), ...patch }
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  })
  return { user: data?.user || null, error }
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const actorAccess = resolveAdminAccess(session.user.user_metadata)
  if (!actorAccess.teamRole) {
    return jsonError('Forbidden', 403)
  }
  const actorTeamRole = actorAccess.teamRole

  const body = await request.json().catch(() => ({}))
  const { action, payload } = body || {}

  if (!action) {
    return jsonError('action is required')
  }

  if (action === 'set_role') {
    if (!hasAdminPermission(actorTeamRole, 'users.manage')) {
      return jsonError('Forbidden', 403)
    }
    const { user_id, role: nextRole } = payload || {}
    if (!user_id || !nextRole) {
      return jsonError('user_id and role are required')
    }
    const { user, error } = await updateUserMetadata(user_id, {
      role: nextRole,
      ...(resolveAdminAccess({ role: nextRole }).isAdmin ? {} : { admin_team_role: null }),
    })
    if (error) {
      return jsonError(error.message || 'Unable to update role')
    }
    await logAdminAction({
      action: 'admin.set_role',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'user',
      targetId: user_id,
      metadata: { role: nextRole },
    })
    return NextResponse.json({ user })
  }

  if (action === 'set_admin_team_role') {
    if (!hasAdminPermission(actorTeamRole, 'users.manage')) {
      return jsonError('Forbidden', 403)
    }
    const { user_id, admin_team_role } = payload || {}
    if (!user_id || !admin_team_role) {
      return jsonError('user_id and admin_team_role are required')
    }
    const nextTeamRole = normalizeAdminTeamRole(admin_team_role)

    const { data: existing, error: existingError } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (existingError || !existing?.user) {
      return jsonError(existingError?.message || 'User not found', 404)
    }
    if (!resolveAdminAccess(existing.user.user_metadata).isAdmin) {
      return jsonError('User must have admin role before assigning an admin team role', 409)
    }

    const { user, error } = await updateUserMetadata(user_id, {
      admin_team_role: nextTeamRole,
    })
    if (error) {
      return jsonError(error.message || 'Unable to update admin team role')
    }

    await logAdminAction({
      action: 'admin.set_admin_team_role',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'user',
      targetId: user_id,
      metadata: { admin_team_role: nextTeamRole },
    })

    return NextResponse.json({ user })
  }


  if (action === 'set_verification_status') {
    if (!hasAdminPermission(actorTeamRole, 'verifications.manage')) {
      return jsonError('Forbidden', 403)
    }
    const { user_id, status } = payload || {}
    if (!user_id || !status) {
      return jsonError('user_id and status are required')
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        verification_status: status,
        verification_reviewed_at: new Date().toISOString(),
        verification_reviewed_by: session.user.id,
      })
      .eq('id', user_id)
      .select()
      .single()
    if (error) {
      return jsonError(error.message)
    }
    await logAdminAction({
      action: 'admin.set_verification_status',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'profile',
      targetId: user_id,
      metadata: { status },
    })
    return NextResponse.json({ profile: data })
  }

  if (action === 'set_suspended') {
    if (!hasAdminPermission(actorTeamRole, 'users.manage')) {
      return jsonError('Forbidden', 403)
    }
    const { user_id, suspended } = payload || {}
    if (!user_id || typeof suspended !== 'boolean') {
      return jsonError('user_id and suspended boolean are required')
    }
    const { user, error } = await updateUserMetadata(user_id, { suspended })
    if (error) {
      return jsonError(error.message || 'Unable to update suspended status')
    }
    await logAdminAction({
      action: 'admin.set_suspended',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'user',
      targetId: user_id,
      metadata: { suspended },
    })
    return NextResponse.json({ user })
  }

  return jsonError('Unsupported action', 400)
}
