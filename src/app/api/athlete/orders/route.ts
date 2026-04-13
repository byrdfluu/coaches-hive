import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type OrderRecord = {
  id: string
  product_id?: string | null
  coach_id?: string | null
  org_id?: string | null
  athlete_id?: string | null
  athlete_profile_id?: string | null
  sub_profile_id?: string | null
  status?: string | null
  fulfillment_status?: string | null
  refund_status?: string | null
  amount?: number | null
  total?: number | null
  price?: number | null
  created_at?: string | null
}

const toMoney = (value: unknown) => {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

const getMissingOrdersColumn = (message?: string | null) => {
  const value = String(message || '')
  const schemaCacheMatch = value.match(/could not find the '([^']+)' column of 'orders' in the schema cache/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]

  const postgresMatch =
    value.match(/column\s+["']?orders["']?\.["']?([a-z_]+)["']?\s+does not exist/i)
    || value.match(/column\s+["']?([a-z_]+)["']?\s+of relation\s+["']?orders["']?\s+does not exist/i)
  return postgresMatch?.[1] || null
}

const loadAthleteOrdersCompat = async (athleteId: string) => {
  let selectColumns = [
    'id',
    'product_id',
    'coach_id',
    'org_id',
    'athlete_id',
    'athlete_profile_id',
    'sub_profile_id',
    'status',
    'fulfillment_status',
    'refund_status',
    'amount',
    'total',
    'price',
    'created_at',
  ]
  let lastResult: any = { data: [], error: null }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await supabaseAdmin
      .from('orders')
      .select(selectColumns.join(', '))
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
    lastResult = result

    const missingColumn = getMissingOrdersColumn(result.error?.message)
    if (!result.error || !missingColumn) {
      return result
    }

    selectColumns = selectColumns.filter((column) => column !== missingColumn)
  }

  return lastResult
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const requestedAthleteProfileId = searchParams.get('athlete_profile_id') || null
  const requestedSubProfileId = searchParams.get('sub_profile_id') || null
  const athleteScope = searchParams.get('athlete_scope') === 'main' ? 'main' : 'all'

  const athleteId = session.user.id
  const primaryOrderResult = await loadAthleteOrdersCompat(athleteId)
  let orderRows = ((primaryOrderResult.data || []) as unknown) as OrderRecord[]
  let orderError = primaryOrderResult.error

  const approvalResult = await supabaseAdmin
    .from('guardian_approvals')
    .select('id, target_type, target_id, target_label, status, scope, created_at, responded_at')
    .eq('athlete_id', athleteId)
    .eq('scope', 'transactions')
    .eq('status', 'approved')
    .order('responded_at', { ascending: false })

  if (orderError) {
    return jsonError(orderError.message, 500)
  }

  const orders = orderRows || []
  const approvedTransactionApprovals = (approvalResult.data || []) as Array<{
    id: string
    target_type?: string | null
    target_id?: string | null
    target_label?: string | null
    status?: string | null
    scope?: string | null
    created_at?: string | null
    responded_at?: string | null
  }>
  const orderIds = orders.map((row) => row.id)
  const productIds = Array.from(new Set(orders.map((row) => row.product_id).filter(Boolean) as string[]))
  const coachIds = Array.from(new Set(orders.map((row) => row.coach_id).filter(Boolean) as string[]))
  const orgIds = Array.from(new Set(orders.map((row) => row.org_id).filter(Boolean) as string[]))
  const approvalCoachIds = Array.from(
    new Set(
      approvedTransactionApprovals
        .filter((row) => row.target_type === 'coach' && row.target_id)
        .map((row) => String(row.target_id)),
    ),
  )
  const approvalOrgIds = Array.from(
    new Set(
      approvedTransactionApprovals
        .filter((row) => row.target_type === 'org' && row.target_id)
        .map((row) => String(row.target_id)),
    ),
  )

  const [
    productsResult,
    coachesResult,
    orgsResult,
    refundRequestsResult,
    receiptsResult,
    subProfilesResult,
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
          .select('id, order_id, receipt_url, status, created_at, metadata')
          .eq('payer_id', athleteId)
          .in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from('athlete_sub_profiles')
      .select('id, name')
      .eq('user_id', athleteId),
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

  const subProfileMap = new Map<string, string>()
  ;(subProfilesResult.data || []).forEach((row: { id: string; name?: string | null }) => {
    subProfileMap.set(row.id, row.name || 'Athlete profile')
  })

  const receiptMap = new Map<string, {
    id: string
    receipt_url: string | null
    status: string | null
    created_at: string | null
    metadata?: Record<string, unknown> | null
  }>()
  ;(receiptsResult.data || []).forEach((row: {
    id: string
    order_id?: string | null
    receipt_url?: string | null
    status?: string | null
    created_at?: string | null
    metadata?: Record<string, unknown> | null
  }) => {
    if (row.order_id) {
      receiptMap.set(row.order_id, {
        id: row.id,
        receipt_url: row.receipt_url || null,
        status: row.status || null,
        created_at: row.created_at || null,
        metadata: row.metadata || null,
      })
    }
  })

  const normalizedOrders = orders.map((order) => {
    const receiptMetadata = receiptMap.get(order.id)?.metadata || null
    const resolvedSubProfileId =
      order.athlete_profile_id
      || order.sub_profile_id
      || (typeof receiptMetadata?.sub_profile_id === 'string' ? String(receiptMetadata.sub_profile_id) : null)
    const resolvedAthleteProfileId =
      order.athlete_profile_id
      || (typeof receiptMetadata?.athlete_profile_id === 'string' ? String(receiptMetadata.athlete_profile_id) : null)
      || resolvedSubProfileId
      || athleteId
    const athleteLabel =
      (resolvedSubProfileId ? subProfileMap.get(resolvedSubProfileId) : null)
      || (typeof receiptMetadata?.athlete_label === 'string' ? String(receiptMetadata.athlete_label) : null)
      || 'Primary athlete'

    return {
      id: order.id,
      product_id: order.product_id || null,
      athlete_profile_id: resolvedAthleteProfileId,
      sub_profile_id: resolvedSubProfileId,
      athlete_label: athleteLabel,
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
    }
  })

  if (approvalCoachIds.length > 0) {
    const { data: approvalCoachRows } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', approvalCoachIds)
    ;(approvalCoachRows || []).forEach((profile: { id: string; full_name?: string | null }) => {
      coachMap.set(profile.id, profile.full_name || coachMap.get(profile.id) || 'Coach')
    })
  }

  if (approvalOrgIds.length > 0) {
    const { data: approvalOrgRows } = await supabaseAdmin
      .from('org_settings')
      .select('org_id, org_name')
      .in('org_id', approvalOrgIds)
    ;(approvalOrgRows || []).forEach((org: { org_id?: string | null; org_name?: string | null }) => {
      if (org.org_id) {
        orgMap.set(org.org_id, org.org_name || orgMap.get(org.org_id) || 'Organization')
      }
    })
  }

  const normalizedOrderTitles = new Set(
    normalizedOrders.map((order) => `${String(order.seller || '').trim().toLowerCase()}::${String(order.title || '').trim().toLowerCase()}`),
  )

  const syntheticApprovalRows = approvedTransactionApprovals
    .filter((approval) => {
      const seller =
        approval.target_type === 'coach'
          ? coachMap.get(String(approval.target_id || '')) || 'Coach'
          : approval.target_type === 'org'
            ? orgMap.get(String(approval.target_id || '')) || 'Organization'
            : 'Seller'
      const title = String(approval.target_label || '').trim() || 'Approved purchase'
      return !normalizedOrderTitles.has(`${seller.trim().toLowerCase()}::${title.toLowerCase()}`)
    })
    .map((approval) => ({
      id: `approval:${approval.id}`,
      product_id: null,
      sub_profile_id: null,
      athlete_label: 'Primary athlete',
      title: String(approval.target_label || '').trim() || 'Approved purchase',
      seller:
        approval.target_type === 'coach'
          ? coachMap.get(String(approval.target_id || '')) || 'Coach'
          : approval.target_type === 'org'
            ? orgMap.get(String(approval.target_id || '')) || 'Organization'
            : 'Seller',
      status: 'Approved',
      fulfillment_status: 'approval_granted',
      refund_status: null,
      amount: null,
      created_at: approval.responded_at || approval.created_at || null,
      receipt_id: null,
      receipt_url: null,
      receipt_status: null,
      receipt_created_at: null,
    }))

  const allOrders = [...normalizedOrders, ...syntheticApprovalRows].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  const filteredOrders = allOrders.filter((order) => {
    if (requestedAthleteProfileId) {
      return (order as { athlete_profile_id?: string | null }).athlete_profile_id === requestedAthleteProfileId
    }
    if (requestedSubProfileId) {
      return order.sub_profile_id === requestedSubProfileId
    }
    if (athleteScope === 'main') {
      return !order.sub_profile_id
    }
    return true
  })

  return NextResponse.json({ orders: filteredOrders })
}
