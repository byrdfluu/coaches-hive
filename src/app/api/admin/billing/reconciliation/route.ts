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

const toNumber = (value: unknown) => {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

const buildReconciliationSnapshot = async () => {
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, payment_intent_id, status, refund_status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1000)
  const { data: receipts } = await supabaseAdmin
    .from('payment_receipts')
    .select('id, order_id, fee_assignment_id, stripe_payment_intent_id, stripe_charge_id, status, amount, org_id, payee_id, metadata, updated_at')
    .order('updated_at', { ascending: false })
    .limit(2000)

  const receiptRows = receipts || []
  const receiptByOrder = new Map<string, any>()
  const receiptByIntent = new Map<string, any>()
  for (const receipt of receiptRows) {
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

  const orgReceipts = receiptRows.filter((receipt) => receipt.org_id)
  const orgReceiptSummary = orgReceipts.reduce(
    (acc, receipt) => {
      const metadata = (receipt.metadata || {}) as Record<string, unknown>
      const gross = toNumber(metadata.gross_amount) || toNumber(receipt.amount)
      const platformFee = toNumber(metadata.platform_fee)
      const netAmount = metadata.net_amount !== undefined ? toNumber(metadata.net_amount) : Math.max(0, gross - platformFee)
      acc.gross += gross
      acc.platformFees += platformFee
      acc.net += netAmount
      if (!platformFee && String(metadata.source || '').toLowerCase() !== 'manual') acc.missingPlatformFee += 1
      if (receipt.stripe_payment_intent_id && !metadata.stripe_transfer_id && receipt.order_id) acc.missingTransferMetadata += 1
      return acc
    },
    { count: orgReceipts.length, gross: 0, platformFees: 0, net: 0, missingPlatformFee: 0, missingTransferMetadata: 0 },
  )

  const orgReceiptSample = orgReceipts.slice(0, 25).map((receipt) => {
    const metadata = (receipt.metadata || {}) as Record<string, unknown>
    const gross = toNumber(metadata.gross_amount) || toNumber(receipt.amount)
    const platformFee = toNumber(metadata.platform_fee)
    return {
      receipt_id: receipt.id,
      order_id: receipt.order_id || null,
      fee_assignment_id: receipt.fee_assignment_id || null,
      org_id: receipt.org_id,
      gross,
      platform_fee: platformFee,
      net_amount: metadata.net_amount !== undefined ? toNumber(metadata.net_amount) : Math.max(0, gross - platformFee),
      platform_fee_rate: metadata.platform_fee_rate ?? null,
      stripe_payment_intent_id: receipt.stripe_payment_intent_id || null,
      stripe_charge_id: receipt.stripe_charge_id || null,
      stripe_transfer_id: metadata.stripe_transfer_id || null,
      status: receipt.status,
    }
  })

  return {
    orders: orders || [],
    mismatches,
    orgReceiptSummary,
    orgReceiptSample,
  }
}

export async function GET() {
  const { response, session } = await requireAdmin()
  if (response || !session) return response

  const snapshot = await buildReconciliationSnapshot()

  return NextResponse.json({
    ok: true,
    scanned_orders: snapshot.orders.length,
    mismatches: snapshot.mismatches.length,
    sample: snapshot.mismatches.slice(0, 10),
    org_reconciliation: snapshot.orgReceiptSummary,
    org_receipts: snapshot.orgReceiptSample,
  })
}

export async function POST() {
  const { response, session } = await requireAdmin()
  if (response || !session) return response

  const snapshot = await buildReconciliationSnapshot()

  let queued = 0
  for (const mismatch of snapshot.mismatches.slice(0, 200)) {
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
      mismatches: snapshot.mismatches.length,
      org_reconciliation: snapshot.orgReceiptSummary,
      queued,
    },
  })

  return NextResponse.json({
    ok: true,
    scanned_orders: snapshot.orders.length,
    mismatches: snapshot.mismatches.length,
    queued_tasks: queued,
    sample: snapshot.mismatches.slice(0, 10),
    org_reconciliation: snapshot.orgReceiptSummary,
    org_receipts: snapshot.orgReceiptSample,
  })
}
