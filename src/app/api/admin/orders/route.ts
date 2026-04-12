import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
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
  'product_id',
  'amount',
  'payment_intent_id',
  'platform_fee',
  'net_amount',
  'status',
  'fulfillment_status',
  'refund_status',
  'refund_amount',
  'refunded_at',
  'created_at',
].join(', ')

const PATCH_ORDER_SELECT = [
  'id',
  'coach_id',
  'athlete_id',
  'org_id',
  'amount',
  'payment_intent_id',
  'status',
  'refund_status',
  'refund_amount',
  'refunded_at',
  'created_at',
].join(', ')

const RECEIPT_SELECT = [
  'id',
  'order_id',
  'payer_id',
  'payee_id',
  'org_id',
  'amount',
  'status',
  'receipt_url',
  'metadata',
  'stripe_payment_intent_id',
  'refund_amount',
  'refunded_at',
  'created_at',
].join(', ')

type OrderRecord = {
  id: string
  coach_id?: string | null
  athlete_id?: string | null
  org_id?: string | null
  product_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  platform_fee?: number | string | null
  net_amount?: number | string | null
  status?: string | null
  fulfillment_status?: string | null
  refund_status?: string | null
  payment_intent_id?: string | null
  refund_amount?: number | string | null
  refunded_at?: string | null
  created_at?: string | null
  receipt_url?: string | null
  product_title?: string | null
  seller_type?: 'coach' | 'org' | 'unknown'
}

type ReceiptRecord = {
  id: string
  order_id?: string | null
  payer_id?: string | null
  payee_id?: string | null
  org_id?: string | null
  amount?: number | string | null
  status?: string | null
  receipt_url?: string | null
  metadata?: Record<string, unknown> | null
  stripe_payment_intent_id?: string | null
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

const getMissingColumn = (table: string, message?: string | null) => {
  const value = String(message || '')
  const schemaCacheMatch = value.match(
    new RegExp(`could not find the '([^']+)' column of '${table}' in the schema cache`, 'i'),
  )
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]

  const postgresMatch =
    value.match(new RegExp(`column\\s+["']?${table}["']?\\.["']?([a-z_]+)["']?\\s+does not exist`, 'i'))
    || value.match(new RegExp(`column\\s+["']?([a-z_]+)["']?\\s+of relation\\s+["']?${table}["']?\\s+does not exist`, 'i'))
  return postgresMatch?.[1] || null
}

const loadCompat = async <T>({
  table,
  columns,
  build,
}: {
  table: string
  columns: string[]
  build: (selectColumns: string[]) => Promise<T>
}) => {
  let selectColumns = [...columns]
  let lastResult: T | null = null

  for (let attempt = 0; attempt < columns.length; attempt += 1) {
    const result = await build(selectColumns)
    lastResult = result
    const missingColumn = getMissingColumn(table, (result as any)?.error?.message)
    if (!(result as any)?.error || !missingColumn) {
      return result
    }
    selectColumns = selectColumns.filter((column) => column !== missingColumn)
  }

  return lastResult as T
}

const loadOrdersByIdsCompat = async (orderIds: string[]) => {
  const selectColumns = [
    'id',
    'coach_id',
    'athlete_id',
    'org_id',
    'product_id',
    'amount',
    'payment_intent_id',
    'platform_fee',
    'net_amount',
    'status',
    'fulfillment_status',
    'refund_status',
    'refund_amount',
    'refunded_at',
    'created_at',
  ]
  return loadCompat({
    table: 'orders',
    columns: selectColumns,
    build: (columns) =>
      supabaseAdmin
        .from('orders')
        .select(columns.join(', '))
        .in('id', orderIds),
  })
}

const loadReceiptsCompat = async (from: number, to: number) => {
  const selectColumns = [
    'id',
    'order_id',
    'payer_id',
    'payee_id',
    'org_id',
    'amount',
    'status',
    'receipt_url',
    'metadata',
    'stripe_payment_intent_id',
    'refund_amount',
    'refunded_at',
    'created_at',
  ]

  return loadCompat({
    table: 'payment_receipts',
    columns: selectColumns,
    build: (columns) =>
      supabaseAdmin
        .from('payment_receipts')
        .select(columns.join(', '), { count: 'exact' })
        .not('order_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, to),
  })
}

const loadSummaryReceiptsCompat = async () => {
  const selectColumns = ['amount', 'status', 'refund_amount', 'refunded_at']
  return loadCompat({
    table: 'payment_receipts',
    columns: selectColumns,
    build: (columns) =>
      supabaseAdmin
        .from('payment_receipts')
        .select(columns.join(', '))
        .not('order_id', 'is', null),
  })
}

const loadProductsCompat = async (productIds: string[]) =>
  loadCompat({
    table: 'products',
    columns: ['id', 'title', 'name'],
    build: (columns) =>
      supabaseAdmin
        .from('products')
        .select(columns.join(', '))
        .in('id', productIds),
  })

const loadProfilesCompat = async (ids: string[]) =>
  loadCompat({
    table: 'profiles',
    columns: ['id', 'full_name', 'email'],
    build: (columns) =>
      supabaseAdmin
        .from('profiles')
        .select(columns.join(', '))
        .in('id', ids),
  })

const loadOrgSettingsCompat = async (orgIds: string[]) =>
  loadCompat({
    table: 'org_settings',
    columns: ['org_id', 'org_name'],
    build: (columns) =>
      supabaseAdmin
        .from('org_settings')
        .select(columns.join(', '))
        .in('org_id', orgIds),
  })

const requireFinanceAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, error: jsonError('Unauthorized', 401) }
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.isAdmin) {
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

  const { data: receipts, error: receiptsError, count: receiptsCount } = await loadReceiptsCompat(from, to)

  if (receiptsError) {
    return jsonError(receiptsError.message, 500)
  }

  const receiptRows = ((receipts || []) as unknown) as ReceiptRecord[]
  const orderIds = Array.from(new Set(receiptRows.map((row) => row.order_id).filter(Boolean) as string[]))
  const { data: orders, error: ordersError } = orderIds.length
    ? await loadOrdersByIdsCompat(orderIds)
    : { data: [], error: null }

  if (ordersError) {
    return jsonError(ordersError.message, 500)
  }

  const orderMap = new Map(
    (((orders || []) as unknown) as OrderRecord[]).map((row) => [row.id, row]),
  )

  const productIds = Array.from(new Set((((orders || []) as unknown) as OrderRecord[]).map((row) => row.product_id).filter(Boolean) as string[]))
  const { data: productRows, error: productError } = productIds.length
    ? await loadProductsCompat(productIds)
    : { data: [], error: null }

  if (productError) {
    return jsonError(productError.message, 500)
  }

  const productMap = new Map(
    ((productRows || []) as Array<{ id: string; title?: string | null; name?: string | null }>).map((row) => [
      row.id,
      row.title || row.name || 'Product',
    ]),
  )

  const orderRows: OrderRecord[] = receiptRows.map((receipt) => {
    const receiptStatus = String(receipt.status || '').toLowerCase()
    const order = receipt.order_id ? orderMap.get(receipt.order_id) : null
    const receiptMetadata = receipt.metadata && typeof receipt.metadata === 'object'
      ? (receipt.metadata as Record<string, unknown>)
      : null
    const normalizedStatus =
      receiptStatus === 'paid'
        ? order?.status || 'Paid'
        : receipt.status || order?.status || 'Paid'
    const normalizedRefundStatus =
      order?.refund_status
      || (receiptStatus === 'refunded' || receipt.refunded_at || Number(receipt.refund_amount || 0) > 0
        ? 'refunded'
        : null)

    return {
      id: receipt.order_id || receipt.id,
      coach_id: order?.coach_id ?? receipt.payee_id ?? null,
      athlete_id: order?.athlete_id ?? receipt.payer_id ?? null,
      org_id: order?.org_id ?? receipt.org_id ?? null,
      product_id: order?.product_id ?? null,
      amount: receipt.amount ?? order?.amount ?? order?.total ?? order?.price ?? null,
      total: order?.total ?? null,
      price: order?.price ?? null,
      platform_fee:
        order?.platform_fee
        ?? (receiptMetadata?.platform_fee !== undefined && receiptMetadata?.platform_fee !== null
          ? toMoney(receiptMetadata?.platform_fee as number | string | null | undefined)
          : null),
      net_amount:
        order?.net_amount
        ?? (receiptMetadata?.net_amount !== undefined && receiptMetadata?.net_amount !== null
          ? toMoney(receiptMetadata?.net_amount as number | string | null | undefined)
          : null),
      status: normalizedStatus,
      fulfillment_status: order?.fulfillment_status ?? null,
      refund_status: normalizedRefundStatus,
      payment_intent_id: order?.payment_intent_id ?? receipt.stripe_payment_intent_id ?? null,
      refund_amount: receipt.refund_amount ?? order?.refund_amount ?? null,
      refunded_at: receipt.refunded_at ?? order?.refunded_at ?? null,
      created_at: receipt.created_at ?? order?.created_at ?? null,
      receipt_url: receipt.receipt_url ?? null,
      product_title: order?.product_id ? productMap.get(order.product_id) || 'Product' : 'Product',
      seller_type: order?.org_id || receipt.org_id ? 'org' : order?.coach_id || receipt.payee_id ? 'coach' : 'unknown',
    }
  })

  const { data: summaryReceipts, error: summaryReceiptsError } = await loadSummaryReceiptsCompat()

  if (summaryReceiptsError) {
    return jsonError(summaryReceiptsError.message, 500)
  }

  const grossRevenue = (summaryReceipts || []).reduce((sum, row) => sum + toMoney(row.amount), 0)
  const refundedCount = (summaryReceipts || []).filter((row) => {
    const status = String(row.status || '').toLowerCase()
    return status === 'refunded' || Boolean(row.refunded_at) || toMoney(row.refund_amount) > 0
  }).length
  const coachIds = Array.from(new Set(orderRows.map((row) => row.coach_id).filter(Boolean)))
  const athleteIds = Array.from(new Set(orderRows.map((row) => row.athlete_id).filter(Boolean)))
  const orgIds = Array.from(new Set(orderRows.map((row) => row.org_id).filter(Boolean)))

  const { data: coachRows } = coachIds.length
    ? await loadProfilesCompat(coachIds)
    : { data: [] }

  const { data: athleteRows } = athleteIds.length
    ? await loadProfilesCompat(athleteIds)
    : { data: [] }

  const { data: orgRows } = orgIds.length
    ? await loadOrgSettingsCompat(orgIds)
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

  const total = Number(receiptsCount || 0) || 0
  const hasNext = to + 1 < total

  return NextResponse.json({
    orders: orderRows,
    summary: {
      gross_revenue: grossRevenue,
      refunded_count: refundedCount,
    },
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
    .select(PATCH_ORDER_SELECT)
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
    .select(PATCH_ORDER_SELECT)
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
