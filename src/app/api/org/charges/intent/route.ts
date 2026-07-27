import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrgPlatformFeeForOrg } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { assignment_id } = body || {}
  if (!assignment_id) return jsonError('assignment_id is required')

  // Fetch athlete's Stripe customer ID so the card is saved for future use
  const { data: athleteProfile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.user.id)
    .maybeSingle()
  const stripeCustomerId = athleteProfile?.stripe_customer_id || null

  const { data: assignment } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status')
    .eq('id', assignment_id)
    .maybeSingle()

  if (!assignment) return jsonError('Assignment not found', 404)
  if (assignment.athlete_id !== session.user.id) return jsonError('Forbidden', 403)
  if (assignment.status === 'paid') return jsonError('Fee already paid', 400)

  const { data: feeRow } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id, title, amount_cents')
    .eq('id', assignment.fee_id)
    .maybeSingle()

  if (!feeRow) return jsonError('Fee not found', 404)

  if (role === 'athlete') {
  }

  const [{ data: orgSettings }, connectStatus] = await Promise.all([
    supabaseAdmin
      .from('org_settings')
      .select('plan')
      .eq('org_id', feeRow.org_id)
      .maybeSingle(),
    loadStripeConnectAccountStatus('org', feeRow.org_id),
  ])

  if (!isStripeConnectEnabled(connectStatus)) {
    return jsonError('Organization must finish Stripe Connect onboarding before accepting payments.', 400)
  }

  const amount = Number(feeRow.amount_cents || 0)
  if (!amount || amount <= 0) return jsonError('Invalid fee amount', 400)

  const feeBreakdown = await calculateOrgPlatformFeeForOrg({
    amountCents: amount,
    orgId: feeRow.org_id,
    tier: orgSettings?.plan,
    kind: 'session',
  })

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: feeBreakdown.platformFeeCents,
      transfer_data: {
        destination: connectStatus!.stripeAccountId,
      },
      ...(stripeCustomerId ? { customer: stripeCustomerId, setup_future_usage: 'on_session' as const } : {}),
      metadata: {
        assignmentId: assignment.id,
        feeId: feeRow.id,
        orgId: feeRow.org_id,
        athleteId: assignment.athlete_id,
        platformFeeCents: String(feeBreakdown.platformFeeCents),
        platformFeeRate: String(feeBreakdown.feeRate),
        stripeProcessingFeeCents: String(feeBreakdown.stripeProcessingFeeCents),
        netAmountCents: String(feeBreakdown.netCents),
        orgTier: feeBreakdown.tier,
        feeCategory: 'session',
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      fee_breakdown: {
        gross_cents: feeBreakdown.grossCents,
        platform_fee_cents: feeBreakdown.platformFeeCents,
        stripe_processing_fee_cents: feeBreakdown.stripeProcessingFeeCents,
        net_cents: feeBreakdown.netCents,
        fee_rate: feeBreakdown.feeRate,
        kind: feeBreakdown.kind,
      },
    })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to create payment intent', 500)
  }
}
