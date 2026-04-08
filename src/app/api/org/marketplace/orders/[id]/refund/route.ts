import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: orderId } = await context.params
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, org_id, payment_intent_id, amount')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return jsonError('Order not found.', 404)
  if (order.org_id !== orgId) return jsonError('Forbidden', 403)
  if (!order.payment_intent_id) return jsonError('No payment intent on order.', 400)

  const body = await request.json().catch(() => ({}))
  const { reason } = body || {}

  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.payment_intent_id,
      reason,
    })

    const nowIso = new Date().toISOString()
    await supabaseAdmin
      .from('orders')
      .update({
        status: 'Refunded',
        refund_status: 'refunded',
        refund_amount: order.amount ?? null,
        refunded_at: nowIso,
      })
      .eq('id', orderId)

    await supabaseAdmin
      .from('payment_receipts')
      .update({
        status: 'refunded',
        refund_amount: order.amount ?? null,
        refunded_at: nowIso,
      })
      .eq('order_id', orderId)

    await supabaseAdmin
      .from('order_refund_requests')
      .update({
        status: 'approved',
        resolved_at: nowIso,
        resolver_id: session.user.id,
        updated_at: nowIso,
      })
      .eq('order_id', orderId)
      .eq('status', 'requested')

    return NextResponse.json({ refund })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to create refund', 500)
  }
}
