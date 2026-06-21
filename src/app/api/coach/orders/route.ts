import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// Returns orders for the authenticated coach, bypassing RLS.
export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const coachId = session.user.id

  const [{ data, error: queryError }, { data: canonicalOrders, error: canonicalError }] = await Promise.all([
    supabaseAdmin
    .from('orders')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('marketplace_orders')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false }),
  ])

  if (queryError || canonicalError) {
    console.error('[coach/orders] query failed', queryError || canonicalError)
    return NextResponse.json({ error: 'Unable to load orders' }, { status: 500 })
  }

  const mappedCanonical = (canonicalOrders || []).map((order) => ({
    ...order, product_id: order.item_id, athlete_id: order.buyer_id,
    total: order.total_amount ?? order.amount, price: order.amount,
  }))
  const orders = [...(data || []), ...mappedCanonical]
    .filter((order, index, rows) => rows.findIndex((candidate) => candidate.id === order.id) === index)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  return NextResponse.json({ orders })
}
