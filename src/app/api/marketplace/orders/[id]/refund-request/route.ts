import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(_: Request, context: { params: { id: string } }) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error
  const isAdminUser = resolveAdminAccess(session.user.user_metadata).isAdmin

  const orderId = context.params.id
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, athlete_id, refund_status')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return jsonError('Order not found', 404)
  if (!isAdminUser && order.athlete_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  const { data: existing } = await supabaseAdmin
    .from('order_refund_requests')
    .select('id, status')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && existing.status === 'requested') {
    return NextResponse.json({ ok: true, request: existing })
  }

  const nowIso = new Date().toISOString()
  const { data: requestRow, error: insertError } = await supabaseAdmin
    .from('order_refund_requests')
    .insert({
      order_id: orderId,
      requester_id: session.user.id,
      reason: 'requested_by_customer',
      status: 'requested',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, status')
    .maybeSingle()

  if (insertError) {
    return jsonError(insertError.message)
  }

  await supabaseAdmin
    .from('orders')
    .update({
      refund_status: 'requested',
      refund_requested_at: nowIso,
    })
    .eq('id', orderId)

  return NextResponse.json({ ok: true, request: requestRow })
}
