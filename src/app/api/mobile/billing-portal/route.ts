import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingStripeCustomerError, MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE } from '@/lib/stripeCustomerErrors'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RETURN_URL = 'coacheshive://billing-updated'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  if (!(await enforcePaymentRateLimit(user.id, 'billing_portal', 5, 60).catch(() => false))) return jsonError('Too many billing portal requests. Try again shortly.', 429)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.stripe_customer_id) {
    return jsonError('No Stripe billing account found. Complete a subscription checkout first.', 404)
  }

  try {
    const configuration = process.env.STRIPE_RECURRING_FEES_PORTAL_CONFIGURATION_ID
    if (!configuration && process.env.NODE_ENV === 'production') return jsonError('Billing portal is not configured', 503)
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: RETURN_URL,
      ...(configuration ? { configuration } : {}),
    })
    await auditPaymentAction({ actorUserId: user.id, action: 'billing_portal_created', targetType: 'stripe_customer',
      targetId: profile.stripe_customer_id, stripeObjectId: session.id, result: 'succeeded' })
    return NextResponse.json({
      portal_url: assertStripeHostedUrl(session.url),
    })
  } catch (err: unknown) {
    if (isMissingStripeCustomerError(err)) {
      return jsonError(MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE, 404)
    }
    safePaymentError('[mobile/billing-portal] failed', err, { user_id: user.id })
    return jsonError('Unable to open billing portal', 500)
  }
}
