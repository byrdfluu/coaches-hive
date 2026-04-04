import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const userId = session.user.id

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('[stripe/connect/verify] Failed to read profile:', profileError)
    return jsonError('Failed to read profile. Please try again.', 500)
  }

  const stripeAccountId = profile?.stripe_account_id || null

  if (!stripeAccountId) {
    return NextResponse.json({ connected: false, stripe_account_id: null })
  }

  // Account ID in DB is sufficient proof of connection — Stripe API used only for extra detail
  let chargesEnabled = false
  let payoutsEnabled = false
  try {
    const acct = await stripe.accounts.retrieve(stripeAccountId)
    chargesEnabled = acct.charges_enabled ?? false
    payoutsEnabled = acct.payouts_enabled ?? false
  } catch (stripeError) {
    console.error('[stripe/connect/verify] Stripe account retrieve failed (account still connected):', stripeError)
  }
  return NextResponse.json({ connected: true, stripe_account_id: stripeAccountId, charges_enabled: chargesEnabled, payouts_enabled: payoutsEnabled })
}
