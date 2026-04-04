import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, error: sessionError } = await getSessionRole(['coach', 'admin'])
  if (sessionError || !session) return sessionError

  const userId = session.user.id
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return jsonError('Unable to load Stripe account')
  }

  if (!profile?.stripe_account_id) {
    return jsonError('Stripe account not connected', 404)
  }

  try {
    const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id)
    return NextResponse.json({ url: loginLink.url })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to create Stripe login link', 500)
  }
}
