import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncCoachStripePayoutSchedule } from '@/lib/coachPayoutSync'
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
    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    let bankLast4 = ''

    if (account.external_accounts && 'data' in account.external_accounts) {
      const external = account.external_accounts.data[0]
      if (external && 'last4' in external) {
        bankLast4 = external.last4 || ''
      }
    }

    if (bankLast4) {
      await supabaseAdmin
        .from('profiles')
        .update({ bank_last4: bankLast4 })
        .eq('id', userId)
    }

    try {
      await syncCoachStripePayoutSchedule(userId)
    } catch {
      // Bank detail refresh should still succeed even if schedule sync fails.
    }

    return NextResponse.json({ bank_last4: bankLast4 })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to fetch Stripe account', 500)
  }
}
