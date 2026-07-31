import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingStripeCustomerError, MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE } from '@/lib/stripeCustomerErrors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RETURN_URL = 'coacheshive://billing-updated'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.stripe_customer_id) {
    return jsonError('No Stripe billing account found. Complete a subscription checkout first.', 404)
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: RETURN_URL,
    })

    return NextResponse.json({
      portal_url: session.url,
    })
  } catch (err: unknown) {
    if (isMissingStripeCustomerError(err)) {
      return jsonError(MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE, 404)
    }
    const message = err instanceof Error ? err.message : 'Unable to open billing portal'
    return jsonError(message, 500)
  }
}
