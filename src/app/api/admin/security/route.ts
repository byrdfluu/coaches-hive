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
  if (!adminAccess.isSuperadmin) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const config = await getAdminConfig('security')
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

  const current = await getAdminConfig<Record<string, any>>('security')
  const next = {
    ...(current || {}),
    ...(data as Record<string, any>),
    pending_payout_approvals: Array.isArray((current as any)?.pending_payout_approvals)
      ? (current as any).pending_payout_approvals
      : [],
  }

  await setAdminConfig('security', next)
  await logAdminAction({
    action: 'admin.security.update',
    actorId: session?.user.id,
    actorEmail: session?.user.email || null,
    targetType: 'admin_config',
    targetId: 'security',
  })
  return NextResponse.json({ config: next })
}
