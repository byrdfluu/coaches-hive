import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST() {
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

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ch_impersonate_user', '', { path: '/', maxAge: 0 })
  res.cookies.set('ch_impersonate_role', '', { path: '/', maxAge: 0 })
  await logAdminAction({
    action: 'admin.impersonate.stop',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
  })
  return res
}
