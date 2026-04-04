import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getBaseUrl = (request: Request) => {
  const requestUrl = new URL(request.url)
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || `${requestUrl.protocol}//${requestUrl.host}`
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const userId = session.user.id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', userId)
    .maybeSingle()

  let stripeAccountId = profile?.stripe_account_id || null
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
      return jsonError('Failed to save Stripe account. Please try again.', 500)
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
}

