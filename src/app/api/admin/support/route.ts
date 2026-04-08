import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
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
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (
    adminAccess.teamRole !== 'support'
    && adminAccess.teamRole !== 'ops'
    && adminAccess.teamRole !== 'finance'
    && adminAccess.teamRole !== 'superadmin'
  ) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const config = await getAdminConfig('support')
  return NextResponse.json({ config })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const action = payload?.action

  if (action === 'use_template') {
    await logAdminAction({
      action: 'admin.support.template_used',
      actorId: session?.user.id,
      actorEmail: session?.user.email || null,
      targetType: 'support_template',
      targetId: payload?.template_id || null,
      metadata: {
        ticket_id: payload?.ticket_id || null,
      },
    })
    return NextResponse.json({ ok: true })
  }

  const data = payload?.data ?? payload?.config
  if (!data) {
    return jsonError('config data is required')
  }

  await setAdminConfig('support', data)
  await logAdminAction({
    action: 'admin.support.update',
    actorId: session?.user.id,
    actorEmail: session?.user.email || null,
    targetType: 'admin_config',
    targetId: 'support',
  })
  return NextResponse.json({ config: data })
}
