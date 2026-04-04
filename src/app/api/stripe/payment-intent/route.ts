import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import type { Stripe } from 'stripe'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { FeeTier, getFeePercentage } from '@/lib/platformFees'
export const dynamic = 'force-dynamic'


export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { error } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (error) return error
  try {
    const body = await request.json().catch(() => ({}))
    const amount = Number(body.amount)
    const currency = (body.currency || 'usd') as string
    const metadata = body.metadata || {}

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 })
    }

    const normalizedAmount = Math.round(amount)
    const coachId = metadata?.coachId

    let intentParams: Stripe.PaymentIntentCreateParams = {
      amount: normalizedAmount,
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
    }

    if (coachId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_account_id')
        .eq('id', coachId)
        .maybeSingle()

      if (profile?.stripe_account_id) {
        const { data: planRow } = await supabaseAdmin
          .from('coach_plans')
          .select('tier')
          .eq('coach_id', coachId)
          .maybeSingle()

        const { data: feeRuleRows } = await supabaseAdmin
          .from('platform_fee_rules')
          .select('tier, category, percentage')
          .eq('active', true)

        const tier = (planRow?.tier as FeeTier) || 'starter'
        const percent = getFeePercentage(tier, 'session', feeRuleRows || [])
        const applicationFee = Math.round(normalizedAmount * (percent / 100))

        intentParams = {
          ...intentParams,
          application_fee_amount: applicationFee,
          transfer_data: { destination: profile.stripe_account_id },
        }
      }
    }

    const intent = await stripe.paymentIntents.create(intentParams)

    return NextResponse.json({ clientSecret: intent.client_secret })
  } catch (error) {
    return NextResponse.json({ error: 'Unable to create payment intent.' }, { status: 500 })
  }
}
