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
  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const config = await getAdminConfig('notices')
  return NextResponse.json({ config })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const message = String(payload?.message || '').trim()
  if (!message) {
    return jsonError('message is required')
  }

  const current = await getAdminConfig<{ items: Array<{ id: string; message: string; created_at: string; author: string }> }>('notices')
  const nextItem = {
    id: `notice-${Date.now()}`,
    message,
    created_at: new Date().toISOString(),
    author: session?.user.email || 'Admin',
  }
  const next = { items: [nextItem, ...(current.items || [])].slice(0, 10) }
  await setAdminConfig('notices', next)

  await logAdminAction({
    action: 'admin.notice.create',
    actorId: session?.user.id,
    actorEmail: session?.user.email || null,
    targetType: 'admin_notice',
    targetId: nextItem.id,
  })

  return NextResponse.json({ notice: nextItem, config: next })
}
