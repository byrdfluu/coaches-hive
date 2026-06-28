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

type ProductRecord = {
  id: string
  title?: string | null
  name?: string | null
  delivery_asset_path?: string | null
  delivery_external_url?: string | null
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
  const orderRows = ((primaryOrderResult.data || []) as unknown) as OrderRecord[]
  const { data: canonicalRows } = await supabaseAdmin
    .from('marketplace_orders')
    .select('*')
    .eq('buyer_id', athleteId)
    .order('created_at', { ascending: false })
  const canonicalOrders = (canonicalRows || []).map((order) => ({
    ...order,
    product_id: order.item_id,
    athlete_id: order.buyer_id,
    amount: order.amount,
    total: order.total_amount ?? order.amount,
    price: order.amount,
  })) as OrderRecord[]

  const allOrders = [...orderRows, ...canonicalOrders]
    .filter((order, index, rows) => rows.findIndex((candidate) => candidate.id === order.id) === index)
    .sort((a, b) => {
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
