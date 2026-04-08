import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendMarketplaceOrderUpdateEmail } from '@/lib/email'
import { isEmailEnabled } from '@/lib/notificationPrefs'
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

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: orderId } = await context.params
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return jsonError('Order not found.', 404)

  if (order.org_id !== orgId) {
    return jsonError('Forbidden', 403)
  }

  const { data: product } = order.product_id
    ? await supabaseAdmin
        .from('products')
        .select('id, title, name, type, price, price_cents, org_id, coach_id')
        .eq('id', order.product_id)
        .maybeSingle()
    : { data: null }

  const { data: athlete } = order.athlete_id
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', order.athlete_id)
        .maybeSingle()
    : { data: null }

  const { data: coach } = order.coach_id
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', order.coach_id)
        .maybeSingle()
    : { data: null }

  const { data: refundRequest } = await supabaseAdmin
    .from('order_refund_requests')
    .select('id, status, reason, created_at, resolved_at, notes')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ order, product, athlete, coach, refund_request: refundRequest || null })
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: orderId } = await context.params
  const body = await request.json().catch(() => ({}))
  const {
    fulfillment_status,
    fulfillment_notes,
    tracking_number,
    status,
  } = body || {}

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, org_id, athlete_id, product_id, status, fulfillment_status')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return jsonError('Order not found.', 404)
  if (order.org_id !== orgId) return jsonError('Forbidden', 403)

  const updates: Record<string, any> = {
    fulfillment_status,
    fulfillment_notes,
    tracking_number,
    status,
  }

  if (fulfillment_status === 'delivered') {
    updates.delivered_at = new Date().toISOString()
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select('*')
    .maybeSingle()

  if (updateError) {
    return jsonError(updateError.message)
  }

  const statusChanged = (data?.status || null) !== (order.status || null)
  const fulfillmentChanged = (data?.fulfillment_status || null) !== (order.fulfillment_status || null)

  if ((statusChanged || fulfillmentChanged) && data?.athlete_id) {
    const [{ data: athlete }, { data: product }] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('email, full_name, notification_prefs')
        .eq('id', data.athlete_id)
        .maybeSingle(),
      data.product_id
        ? supabaseAdmin
            .from('products')
            .select('title, name, type')
            .eq('id', data.product_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (athlete?.email && isEmailEnabled(athlete.notification_prefs, 'marketplace')) {
      await sendMarketplaceOrderUpdateEmail({
        toEmail: athlete.email,
        toName: athlete.full_name || null,
        productName: product?.title || product?.name || product?.type || 'your order',
        newStatus: data.fulfillment_status || data.status || 'updated',
        orderId: data.id,
        dashboardUrl: '/athlete/marketplace/orders',
      })
    }
  }

  return NextResponse.json({ order: data })
}
