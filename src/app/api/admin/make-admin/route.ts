import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { logAdminAction } from '@/lib/auditLog'
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    return jsonError('Missing Supabase service role configuration', 500)
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  })

  if (!authResponse.ok) {
    const payload = await authResponse.json().catch(() => ({}))
    return jsonError(payload?.msg || payload?.error || payload?.message || 'Unable to fetch user', authResponse.status)
  }

  const authPayload = await authResponse.json().catch(() => ({}))
  const current = authPayload?.user_metadata || {}
  const updated = { ...current, role: 'admin', admin_team_role: current.admin_team_role || 'superadmin' }

  const updateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${session.user.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_metadata: updated }),
  })

  if (!updateResponse.ok) {
    const payload = await updateResponse.json().catch(() => ({}))
    return jsonError(payload?.msg || payload?.error || payload?.message || 'Unable to update role', updateResponse.status)
  }

  await logAdminAction({
    action: 'admin.self_promote',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'user',
    targetId: session.user.id,
    metadata: { role: 'admin' },
  })

  return NextResponse.json({ ok: true, role: 'admin' })
}
