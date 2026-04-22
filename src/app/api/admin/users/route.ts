import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAdminPermission, resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const listAllAuthUsers = async () => {
  const users: Array<any> = []

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) {
      return { users: [], error }
    }

    const pageUsers = data.users || []
    users.push(...pageUsers)
    if (pageUsers.length < 200) break
  }

  return { users, error: null as any }
}

const getEmailVerificationStatus = (user: any) =>
  user?.email_confirmed_at || user?.confirmed_at ? 'Email verified' : 'Email verification pending'

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
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

  const { users: authUsers, error } = await listAllAuthUsers()
  if (error) {
    return jsonError(error.message)
  }

  const userIds = authUsers.map((user) => user.id)
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, heard_from')
        .in('id', userIds)
    : { data: [], error: null }

  if (profilesError) {
    return jsonError(profilesError.message, 500)
  }

  const profileMap = new Map(
    ((profiles || []) as Array<{ id: string; full_name?: string | null; heard_from?: string | null }>).map((profile) => [
      profile.id,
      profile,
    ]),
  )

  const users = authUsers.map((user) => {
    const access = resolveAdminAccess(user.user_metadata)
    const nextRole = access.role || String(user.user_metadata?.role || 'unknown')
    const profile = profileMap.get(user.id) || null
    return {
      id: user.id,
      email: user.email || '',
      role: nextRole,
      admin_team_role: access.teamRole,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      heard_from: profile?.heard_from || '',
      email_status: getEmailVerificationStatus(user),
      status: user.user_metadata?.suspended ? 'Suspended' : 'Active',
    }
  })

  return NextResponse.json({ users, can_manage: canManage })
}
