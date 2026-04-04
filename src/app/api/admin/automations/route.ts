import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'ops' && adminAccess.teamRole !== 'superadmin') {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const config = await getAdminConfig('automations')
  return NextResponse.json({ config })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const data = payload?.data ?? payload?.config
  if (!data) {
    return jsonError('config data is required')
  }

  await setAdminConfig('automations', data)
  await logAdminAction({
    action: 'admin.automations.update',
    actorId: session?.user.id,
    actorEmail: session?.user.email || null,
    targetType: 'admin_config',
    targetId: 'automations',
  })
  return NextResponse.json({ config: data })
}
