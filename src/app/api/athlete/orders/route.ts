import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const toMoney = (value: unknown) => {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

export async function GET() {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const athleteId = session.user.id
  const { data: orderRows, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, product_id, coach_id, org_id, athlete_id, status, fulfillment_status, refund_status, amount, total, price, created_at')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })

  if (orderError) {
    return jsonError(orderError.message, 500)
  }

  const orders = orderRows || []
  const orderIds = orders.map((row) => row.id)
  const productIds = Array.from(new Set(orders.map((row) => row.product_id).filter(Boolean) as string[]))
  const coachIds = Array.from(new Set(orders.map((row) => row.coach_id).filter(Boolean) as string[]))
  const orgIds = Array.from(new Set(orders.map((row) => row.org_id).filter(Boolean) as string[]))

  const [
    productsResult,
    coachesResult,
    orgsResult,
    refundRequestsResult,
    receiptsResult,
  ] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from('products').select('id, title, name').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin.from('profiles').select('id, full_name').in('id', coachIds)
      : Promise.resolve({ data: [], error: null }),
    orgIds.length
      ? supabaseAdmin.from('org_settings').select('org_id, org_name').in('org_id', orgIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseAdmin.from('order_refund_requests').select('order_id, status').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseAdmin
          .from('payment_receipts')
          .select('id, order_id, receipt_url, status, created_at')
          .eq('payer_id', athleteId)
          .in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const productMap = new Map<string, string>()
  ;(productsResult.data || []).forEach((product: { id: string; title?: string | null; name?: string | null }) => {
    productMap.set(product.id, product.title || product.name || 'Product')
  })

  const coachMap = new Map<string, string>()
  ;(coachesResult.data || []).forEach((profile: { id: string; full_name?: string | null }) => {
    coachMap.set(profile.id, profile.full_name || 'Coach')
  })

  const orgMap = new Map<string, string>()
  ;(orgsResult.data || []).forEach((org: { org_id?: string | null; org_name?: string | null }) => {
    if (org.org_id) {
      orgMap.set(org.org_id, org.org_name || 'Organization')
    }
  })

  const refundMap = new Map<string, string>()
  ;(refundRequestsResult.data || []).forEach((row: { order_id?: string | null; status?: string | null }) => {
    if (row.order_id) {
      refundMap.set(row.order_id, row.status || 'requested')
    }
  })

  const receiptMap = new Map<string, { id: string; receipt_url: string | null; status: string | null; created_at: string | null }>()
  ;(receiptsResult.data || []).forEach((row: { id: string; order_id?: string | null; receipt_url?: string | null; status?: string | null; created_at?: string | null }) => {
    if (row.order_id) {
      receiptMap.set(row.order_id, {
        id: row.id,
        receipt_url: row.receipt_url || null,
        status: row.status || null,
        created_at: row.created_at || null,
      })
    }
  })

  const normalizedOrders = orders.map((order) => ({
    id: order.id,
    product_id: order.product_id || null,
    title: order.product_id ? productMap.get(order.product_id) || 'Product' : 'Product',
    seller:
      order.coach_id
        ? coachMap.get(order.coach_id) || 'Coach'
        : order.org_id
          ? orgMap.get(order.org_id) || 'Organization'
          : 'Seller',
    status: order.status || 'Active',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    refund_status: order.refund_status || refundMap.get(order.id) || null,
    amount: toMoney(order.amount ?? order.total ?? order.price),
    created_at: order.created_at || null,
    receipt_id: receiptMap.get(order.id)?.id || null,
    receipt_url: receiptMap.get(order.id)?.receipt_url || null,
    receipt_status: receiptMap.get(order.id)?.status || null,
    receipt_created_at: receiptMap.get(order.id)?.created_at || null,
  }))

  return NextResponse.json({ orders: normalizedOrders })
}
