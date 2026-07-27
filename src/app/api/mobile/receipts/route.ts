import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const stripeReceiptUrl = async (paymentIntentId?: string | null) => {
  if (!paymentIntentId) return null
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    })
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
    return charge?.receipt_url || null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const [{ data: stripeRows, error }, { data: appleRows }] = await Promise.all([
    supabaseAdmin
      .from('payment_receipts')
      .select('id, amount, currency, status, receipt_url, stripe_payment_intent_id, stripe_charge_id, refund_amount, refunded_at, created_at, metadata')
      .eq('payer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('apple_iap_subscriptions')
      .select('original_transaction_id, latest_transaction_id, product_id, environment, status, expires_at, revoked_at, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ])
  if (error) return jsonError('Unable to load payment receipts', 500)

  const stripeReceipts = await Promise.all((stripeRows || []).map(async (row) => {
    const officialUrl = row.receipt_url || await stripeReceiptUrl(row.stripe_payment_intent_id)
    if (officialUrl && !row.receipt_url) {
      await supabaseAdmin.from('payment_receipts').update({ receipt_url: officialUrl }).eq('id', row.id)
    }
    return {
      ...row,
      source: 'stripe',
      receipt_url: officialUrl,
      downloadable_record: officialUrl ? null : row,
    }
  }))

  const appleReceipts = (appleRows || []).map((row) => ({
    id: `apple:${row.original_transaction_id}`,
    source: 'apple',
    receipt_url: null,
    original_transaction_id: row.original_transaction_id,
    transaction_id: row.latest_transaction_id,
    product_id: row.product_id,
    environment: row.environment,
    status: row.status,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    downloadable_record: row,
  }))

  return NextResponse.json({ receipts: [...stripeReceipts, ...appleReceipts] })
}

