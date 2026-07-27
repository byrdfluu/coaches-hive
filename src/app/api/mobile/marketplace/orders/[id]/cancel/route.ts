import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const loadOrder = async (id: string, userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('marketplace_orders')
    .select('id, buyer_id, amount, total_amount, status, payment_status, refund_status, stripe_payment_intent_id, created_at')
    .eq('id', id)
    .eq('buyer_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

const eligibility = (order: any) => {
  const paymentStatus = String(order.payment_status || order.status || '').toLowerCase()
  const refundStatus = String(order.refund_status || '').toLowerCase()
  const eligible = ['paid', 'complete', 'completed'].includes(paymentStatus)
    && !['requested', 'processing', 'refunded'].includes(refundStatus)
  return {
    eligible,
    reason: eligible ? null : 'Order is not eligible for buyer cancellation',
    resulting_payment_status: paymentStatus,
    resulting_refund_status: refundStatus || null,
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const { id } = await context.params
  const order = await loadOrder(id, user.id).catch(() => null)
  if (!order) return jsonError('Order not found', 404)
  return NextResponse.json({ order_id: id, ...eligibility(order) })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const { id } = await context.params
  const order = await loadOrder(id, user.id).catch(() => null)
  if (!order) return jsonError('Order not found', 404)
  const state = eligibility(order)
  if (!state.eligible) return NextResponse.json({ order_id: id, ...state }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const reason = String(body?.reason || 'Buyer requested marketplace order cancellation').trim()
  const amount = Number(order.total_amount ?? order.amount)
  const { data: existing } = await supabaseAdmin
    .from('payment_refund_requests')
    .select('id, status')
    .eq('requester_id', user.id)
    .eq('payment_type', 'marketplace_order')
    .eq('payment_record_id', id)
    .in('status', ['requested', 'under_review', 'approved', 'processing'])
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      order_id: id,
      cancellation_status: 'requested',
      refund_request: existing,
      payment_status: state.resulting_payment_status,
    })
  }

  const { data: refundRequest, error } = await supabaseAdmin
    .from('payment_refund_requests')
    .insert({
      requester_id: user.id,
      payment_type: 'marketplace_order',
      payment_record_id: id,
      amount,
      reason: reason.length >= 10 ? reason : 'Buyer requested marketplace cancellation',
      status: 'requested',
    })
    .select('id, status, requested_at')
    .single()
  if (error) return jsonError('Unable to request marketplace cancellation', 500)

  return NextResponse.json({
    order_id: id,
    cancellation_status: 'requested',
    refund_request: refundRequest,
    payment_status: state.resulting_payment_status,
  })
}

