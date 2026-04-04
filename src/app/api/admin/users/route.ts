import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAdminPermission, resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.teamRole) {
    return jsonError('Forbidden', 403)
  }
  const canManage = hasAdminPermission(adminAccess.teamRole, 'users.manage')

  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) {
    return jsonError(error.message)
  }

  const users = data.users.map((user) => {
    const access = resolveAdminAccess(user.user_metadata)
    const nextRole = access.role || String(user.user_metadata?.role || 'unknown')
    return {
      id: user.id,
      email: user.email || '',
      role: nextRole,
      admin_team_role: access.teamRole,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      status: user.user_metadata?.suspended ? 'Suspended' : 'Active',
    }
  })

  return NextResponse.json({ users, can_manage: canManage })
}
