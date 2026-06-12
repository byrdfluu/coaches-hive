import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
import Stripe from 'stripe'

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
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('[stripe/connect] Failed to read coach profile:', profileError)
    return safeError('Unable to read your coach payment profile. Please try again.', 500)
  }

  let stripeAccountId = profile?.stripe_account_id || null

  try {
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { coach_id: userId },
      })
      stripeAccountId = account.id
      const { error: dbError } = await supabaseAdmin
        .from('profiles')
        .upsert({ id: userId, stripe_account_id: stripeAccountId }, { onConflict: 'id' })
      if (dbError) {
        console.error('[stripe/connect] Failed to save stripe_account_id:', dbError)
        await stripe.accounts.del(stripeAccountId).catch((deleteError) => {
          console.error('[stripe/connect] Failed to clean up unsaved Stripe account:', deleteError)
        })
        return safeError('Stripe account was created, but we could not save it to your coach profile.', 500)
      }
    }

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
