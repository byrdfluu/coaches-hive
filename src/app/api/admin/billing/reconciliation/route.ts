import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import type { Session } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { queueOperationTaskSafely } from '@/lib/operations'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async (): Promise<
  | { response: NextResponse; session: null }
  | { response: null; session: Session }
> => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { response: jsonError('Unauthorized', 401), session: null }
  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { response: jsonError('Forbidden', 403), session: null }
  }
  return { response: null, session }
}

export async function POST() {
  const { response, session } = await requireAdmin()
  if (response || !session) return response

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, payment_intent_id, status, refund_status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1000)
  const { data: receipts } = await supabaseAdmin
    .from('payment_receipts')
    .select('id, order_id, stripe_payment_intent_id, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(2000)

  const receiptByOrder = new Map<string, any>()
  const receiptByIntent = new Map<string, any>()
  for (const receipt of receipts || []) {
    if (receipt.order_id && !receiptByOrder.has(receipt.order_id)) receiptByOrder.set(receipt.order_id, receipt)
    if (receipt.stripe_payment_intent_id && !receiptByIntent.has(receipt.stripe_payment_intent_id)) {
      receiptByIntent.set(receipt.stripe_payment_intent_id, receipt)
    }
  }

  const mismatches: Array<{ order_id: string; reason: string; payment_intent_id: string | null }> = []
  for (const order of orders || []) {
    const byOrder = receiptByOrder.get(order.id)
    const byIntent = order.payment_intent_id ? receiptByIntent.get(order.payment_intent_id) : null
    if (!byOrder && !byIntent && order.payment_intent_id) {
      mismatches.push({
        order_id: order.id,
        payment_intent_id: order.payment_intent_id,
        reason: 'Order has payment_intent_id but no receipt record',
      })
      continue
    }
    const receipt = byOrder || byIntent
    if (!receipt) continue
    const orderRefunded = String(order.refund_status || '').toLowerCase() === 'refunded'
    const receiptRefunded = String(receipt.status || '').toLowerCase() === 'refunded'
    if (orderRefunded !== receiptRefunded) {
      mismatches.push({
        order_id: order.id,
        payment_intent_id: order.payment_intent_id || null,
        reason: `Refund status mismatch order=${order.refund_status || 'none'} receipt=${receipt.status || 'none'}`,
      })
    }
  }

  let queued = 0
  for (const mismatch of mismatches.slice(0, 200)) {
    await queueOperationTaskSafely({
      type: 'billing_recovery',
      title: `Billing reconciliation mismatch for order ${mismatch.order_id}`,
      priority: 'high',
      owner: 'Finance Ops',
      entity_type: 'order',
      entity_id: mismatch.order_id,
      max_attempts: 5,
      idempotency_key: `billing_reconcile:${mismatch.order_id}:${mismatch.reason}`,
      metadata: {
        reason: mismatch.reason,
        payment_intent_id: mismatch.payment_intent_id,
      },
    })
    queued += 1
  }

  await logAdminAction({
    action: 'billing.reconciliation.run',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'billing_reconciliation',
    targetId: null,
    metadata: {
      mismatches: mismatches.length,
      queued,
    },
  })

  return NextResponse.json({
    ok: true,
    scanned_orders: (orders || []).length,
    mismatches: mismatches.length,
    queued_tasks: queued,
    sample: mismatches.slice(0, 10),
  })
}
