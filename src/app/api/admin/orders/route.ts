import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const ORDER_SELECT = [
  'id',
  'coach_id',
  'athlete_id',
  'org_id',
  'amount',
  'total',
  'price',
  'status',
  'refund_status',
  'payment_intent_id',
  'refund_amount',
  'refunded_at',
  'created_at',
].join(', ')

type OrderRecord = {
  id: string
  coach_id?: string | null
  athlete_id?: string | null
  org_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  status?: string | null
  refund_status?: string | null
  payment_intent_id?: string | null
  refund_amount?: number | string | null
  refunded_at?: string | null
  created_at?: string | null
}

const toMoney = (...values: Array<number | string | null | undefined>) => {
  for (const value of values) {
    const amount = Number(value ?? NaN)
    if (Number.isFinite(amount)) return amount
  }
  return 0
}

const requireFinanceAdmin = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, error: jsonError('Unauthorized', 401) }
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'finance' && adminAccess.teamRole !== 'superadmin') {
    return { session: null, error: jsonError('Forbidden', 403) }
  }

  return { session, error: null as NextResponse | null }
}

export async function GET(request: Request) {
  const { error } = await requireFinanceAdmin()
  if (error) return error

  const url = new URL(request.url)
  const pageParam = Number(url.searchParams.get('page') || '1')
  const pageSizeParam = Number(url.searchParams.get('page_size') || '50')
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1
  const pageSize = Number.isFinite(pageSizeParam)
    ? Math.min(100, Math.max(10, Math.floor(pageSizeParam)))
    : 50
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: orders, error: ordersError, count } = await supabaseAdmin
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (ordersError) {
    return jsonError(ordersError.message)
  }

  const orderRows = (orders || []) as unknown as OrderRecord[]
  const coachIds = Array.from(new Set(orderRows.map((row) => row.coach_id).filter(Boolean)))
  const athleteIds = Array.from(new Set(orderRows.map((row) => row.athlete_id).filter(Boolean)))
  const orgIds = Array.from(new Set(orderRows.map((row) => row.org_id).filter(Boolean)))

  const { data: coachRows } = coachIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', coachIds)
    : { data: [] }

  const { data: athleteRows } = athleteIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', athleteIds)
    : { data: [] }

  const { data: orgRows } = orgIds.length
    ? await supabaseAdmin
        .from('org_settings')
        .select('org_id, org_name')
        .in('org_id', orgIds)
    : { data: [] }

  const coaches = (coachRows || []).reduce<Record<string, { name: string; email: string }>>((acc, row) => {
    acc[row.id] = { name: row.full_name || row.email || 'Coach', email: row.email || '' }
    return acc
  }, {})

  const athletes = (athleteRows || []).reduce<Record<string, { name: string; email: string }>>((acc, row) => {
    acc[row.id] = { name: row.full_name || row.email || 'Athlete', email: row.email || '' }
    return acc
  }, {})

  const orgs = (orgRows || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.org_id] = row.org_name || 'Organization'
    return acc
  }, {})

  const total = Number(count || 0) || 0
  const hasNext = to + 1 < total

  return NextResponse.json({
    orders: orderRows,
    coaches,
    athletes,
    orgs,
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_next: hasNext,
    },
  })
}

export async function PATCH(request: Request) {
  const { session, error } = await requireFinanceAdmin()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const orderId = String(body?.order_id || '').trim()
  const action = String(body?.action || '').trim().toLowerCase()

  if (!orderId) return jsonError('order_id is required')
  if (!['approve', 'dispute', 'refund'].includes(action)) {
    return jsonError('action must be one of approve, dispute, refund')
  }

  const { data: existingOrder, error: loadError } = await supabaseAdmin
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle()

  if (loadError) {
    return jsonError(loadError.message, 500)
  }
  if (!existingOrder) {
    return jsonError('Order not found', 404)
  }
  const currentOrder = existingOrder as unknown as OrderRecord

  const existingStatus = String(currentOrder.status || '').toLowerCase()
  const existingRefundStatus = String(currentOrder.refund_status || '').toLowerCase()
  const nowIso = new Date().toISOString()
  const orderUpdates: Record<string, any> = {}
  const receiptUpdates: Record<string, any> = {}

  if (action === 'approve') {
    if (existingRefundStatus === 'refunded' || existingStatus === 'refunded') {
      return jsonError('Cannot approve a refunded order', 409)
    }
    orderUpdates.status = 'paid'
    receiptUpdates.status = 'paid'
  }

  if (action === 'dispute') {
    if (existingRefundStatus === 'refunded' || existingStatus === 'refunded') {
      return jsonError('Cannot dispute a refunded order', 409)
    }
    orderUpdates.status = 'disputed'
    if (!existingRefundStatus) {
      orderUpdates.refund_status = 'disputed'
    }
    receiptUpdates.status = 'disputed'
  }

  if (action === 'refund') {
    const refundAmount = toMoney(currentOrder.amount, currentOrder.total, currentOrder.price)
    orderUpdates.status = 'refunded'
    orderUpdates.refund_status = 'refunded'
    orderUpdates.refund_amount = refundAmount
    orderUpdates.refunded_at = nowIso
    receiptUpdates.status = 'refunded'
    receiptUpdates.refund_amount = refundAmount
    receiptUpdates.refunded_at = nowIso
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update(orderUpdates)
    .eq('id', orderId)
    .select(ORDER_SELECT)
    .single()

  if (updateError) {
    return jsonError(updateError.message, 500)
  }
  const nextOrder = updatedOrder as unknown as OrderRecord

  if (Object.keys(receiptUpdates).length) {
    await supabaseAdmin
      .from('payment_receipts')
      .update(receiptUpdates)
      .eq('order_id', orderId)
  }

  await logAdminAction({
    action: `admin.orders.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'order',
    targetId: orderId,
    metadata: {
      from_status: currentOrder.status || null,
      from_refund_status: currentOrder.refund_status || null,
      to_status: nextOrder.status || null,
      to_refund_status: nextOrder.refund_status || null,
    },
  })

  return NextResponse.json({ ok: true, order: nextOrder })
}
