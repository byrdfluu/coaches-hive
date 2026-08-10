import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const targetType = String(body.target_type || ''), targetId = String(body.target_id || ''), reason = String(body.reason || '').trim()
  if (!targetId || !['user','organization'].includes(targetType)) return NextResponse.json({ error: 'A valid target is required.' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })
  const supabase = await createRouteHandlerClientCompat()
  const rpc = targetType === 'user' ? 'admin_set_user_test_status' : 'admin_set_organization_test_status'
  const args = targetType === 'user'
    ? { p_user_id: targetId, p_is_test: Boolean(body.is_test), p_reason: reason }
    : { p_org_id: targetId, p_is_test: Boolean(body.is_test), p_reason: reason }
  const { error } = await supabase.rpc(rpc, args)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, is_test: Boolean(body.is_test), audit_preserved: true })
}
