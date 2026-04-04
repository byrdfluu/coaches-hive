import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const getSession = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { supabase, session: null, error: jsonError('Unauthorized', 401) }
  return { supabase, session, error: null }
}

export async function GET() {
  const { session, error } = await getSession()
  if (error || !session) return error
  const metadata = (session.user.user_metadata || {}) as Record<string, any>
  return NextResponse.json({
    auth_session_version: Number(metadata.auth_session_version || 0),
    force_logout_after: metadata.force_logout_after || null,
    suspended: Boolean(metadata.suspended),
    suspicious_login: Boolean(metadata.suspicious_login),
  })
}

export async function POST(request: Request) {
  const { supabase, session, error } = await getSession()
  if (error || !session) return error

  const payload = await request.json().catch(() => ({}))
  const action = String(payload?.action || '').trim()
  if (!action) return jsonError('action is required')

  const { data: userPayload, error: userError } = await supabaseAdmin.auth.admin.getUserById(session.user.id)
  if (userError || !userPayload?.user) return jsonError(userError?.message || 'User not found', 500)
  const metadata = (userPayload.user.user_metadata || {}) as Record<string, any>
  const nowIso = new Date().toISOString()

  if (action === 'force_logout_all') {
    const nextMetadata = {
      ...metadata,
      force_logout_after: nowIso,
      auth_session_version: Number(metadata.auth_session_version || 0) + 1,
      lifecycle_updated_at: nowIso,
    }
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: nextMetadata,
    })
    if (updateError) return jsonError(updateError.message, 500)
    await supabase.auth.signOut()
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear_force_logout') {
    const nextMetadata = {
      ...metadata,
      force_logout_after: null,
      suspicious_login: false,
      lifecycle_updated_at: nowIso,
    }
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: nextMetadata,
    })
    if (updateError) return jsonError(updateError.message, 500)
    return NextResponse.json({ ok: true })
  }

  return jsonError('Unsupported action')
}
