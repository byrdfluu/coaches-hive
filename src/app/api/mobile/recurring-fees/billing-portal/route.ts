import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401)
  const body = await request.json().catch(() => ({}))
  const feeId = String(body.fee_id || '').trim()
  if (!feeId) return mobileError('fee_id is required', 422)
  const { data: fee } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,payer_user_id,stripe_customer_id').eq('id', feeId).maybeSingle()
  if (!fee) return mobileError('Recurring fee not found', 404)
  if (fee.payer_user_id !== user.id) return mobileError('Forbidden', 403)
  if (!fee.stripe_customer_id) return mobileError('Recurring fee billing account is not ready', 409)
  if (!(await enforcePaymentRateLimit(user.id, 'recurring_fee_portal', 5, 60).catch(() => false))) return mobileError('Too many billing portal requests. Try again shortly.', 429)
  const configuration = process.env.STRIPE_RECURRING_FEES_PORTAL_CONFIGURATION_ID
  if (!configuration && process.env.NODE_ENV === 'production') return mobileError('Billing portal is not configured', 503)
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: fee.stripe_customer_id,
      ...(configuration ? { configuration } : {}),
      return_url: `${APP_URL}/mobile/payment-return?status=billing_updated&fee_id=${fee.id}`,
    })
    await auditPaymentAction({ actorUserId: user.id, action: 'recurring_billing_portal_created', targetType: 'organization_recurring_fee',
      targetId: fee.id, stripeObjectId: session.id, result: 'succeeded' })
    return NextResponse.json({ portal_url: assertStripeHostedUrl(session.url) })
  } catch (error) {
    safePaymentError('[recurring-fees/billing-portal] Stripe portal failed', error, { fee_id: fee.id })
    return mobileError('Unable to open billing portal', 500)
  }
}
