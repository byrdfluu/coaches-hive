import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { isSuperadminUser } from '@/lib/recurringFees'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401)
  const body = await request.json().catch(() => ({}))
  const feeId = String(body.fee_id || '').trim()
  if (!feeId) return mobileError('fee_id is required')
  const { data: fee } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,payer_user_id,stripe_customer_id').eq('id', feeId).maybeSingle()
  if (!fee) return mobileError('Recurring fee not found', 404)
  if (fee.payer_user_id !== user.id && !(await isSuperadminUser(user))) return mobileError('Forbidden', 403)
  if (!fee.stripe_customer_id) return mobileError('Recurring fee billing account is not ready', 409)
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: fee.stripe_customer_id,
      return_url: `${APP_URL}/mobile/payment-return?status=billing_updated&fee_id=${fee.id}`,
    })
    return NextResponse.json({ portal_url: session.url })
  } catch (error) {
    console.error('[recurring-fees/billing-portal] Stripe portal failed', { fee_id: fee.id, error })
    return mobileError('Unable to open billing portal', 500)
  }
}
