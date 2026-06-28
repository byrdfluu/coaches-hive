import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// Payment fulfillment belongs exclusively to the Stripe webhook. This endpoint
// only reports whether the webhook-created order is available yet.
export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error
  const body = await request.json().catch(() => null)
  const paymentIntentId = String(body?.payment_intent_id || '').trim()
  if (!paymentIntentId) return jsonError('payment_intent_id is required')

  const { data: order, error: queryError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('payment_intent_id', paymentIntentId)
    .eq('athlete_id', session.user.id)
    .maybeSingle()
  if (queryError) return jsonError('Unable to check order status', 500)
  if (!order) return NextResponse.json({ pending: true }, { status: 202 })
  return NextResponse.json({ order })
}
