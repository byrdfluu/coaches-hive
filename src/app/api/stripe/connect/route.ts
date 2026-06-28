import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import Stripe from 'stripe'
import { createOrReuseStripeConnectAccount } from '@/lib/stripeConnectAccounts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getBaseUrl = (request: Request) => {
  const requestUrl = new URL(request.url)
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || `${requestUrl.protocol}//${requestUrl.host}`
}

const safeError = (message: string, status = 500) => NextResponse.json({ error: message }, { status })

const getStripeErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message === 'Missing STRIPE_SECRET_KEY') {
    return 'Stripe is not configured. Add STRIPE_SECRET_KEY and restart the app.'
  }
  if (error instanceof Stripe.errors.StripeError) {
    if (error.type === 'StripePermissionError') {
      return 'Stripe Connect is not enabled for this Stripe account.'
    }
    if (error.type === 'StripeAuthenticationError') {
      return 'Stripe authentication failed. Check STRIPE_SECRET_KEY.'
    }
    return error.message || 'Stripe could not start onboarding.'
  }
  return 'Unable to start Stripe onboarding. Please try again.'
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const userId = session.user.id
  try {
    const accountStatus = await createOrReuseStripeConnectAccount('coach', userId, { owner_type: 'coach', coach_id: userId, user_id: userId })
    const stripeAccountId = accountStatus.stripeAccountId

    const baseUrl = getBaseUrl(request)
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/coach/stripe-setup?stripe=refresh`,
      return_url: `${baseUrl}/coach/stripe-setup?stripe=success`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url, stripe_account_id: stripeAccountId })
  } catch (stripeError) {
    console.error('[stripe/connect] Stripe onboarding failed:', stripeError)
    return safeError(getStripeErrorMessage(stripeError), 500)
  }
}
