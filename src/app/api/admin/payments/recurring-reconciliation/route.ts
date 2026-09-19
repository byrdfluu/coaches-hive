import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const { data, error } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,organization_id,athlete_id,payer_user_id,status,stripe_subscription_id,stripe_connected_account_id,amount_cents,currency,interval,updated_at')
    .not('stripe_subscription_id', 'is', null).order('updated_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: 'Unable to load recurring billing records' }, { status: 500 })
  const issues: Array<Record<string, unknown>> = []
  for (const fee of data || []) {
    const subscription = await stripe.subscriptions.retrieve(fee.stripe_subscription_id!).catch(() => null)
    if (!subscription) { issues.push({ fee_id: fee.id, type: 'stripe_subscription_missing' }); continue }
    const item = subscription.items.data[0]
    const destination = typeof subscription.transfer_data?.destination === 'string'
      ? subscription.transfer_data.destination : subscription.transfer_data?.destination?.id
    if (subscription.status !== fee.status && !(fee.status === 'paused' && subscription.pause_collection)) {
      issues.push({ fee_id: fee.id, type: 'status_mismatch', database: fee.status, stripe: subscription.status })
    }
    if (destination !== fee.stripe_connected_account_id) issues.push({ fee_id: fee.id, type: 'destination_mismatch' })
    if (Number(item?.price?.unit_amount || 0) !== Number(fee.amount_cents)) issues.push({ fee_id: fee.id, type: 'amount_mismatch' })
    if (Number(subscription.application_fee_percent || 0) !== 4) issues.push({ fee_id: fee.id, type: 'platform_fee_mismatch' })
  }
  return NextResponse.json({ checked: data?.length || 0, issues, authoritative_source: 'stripe', mutating: false })
}
