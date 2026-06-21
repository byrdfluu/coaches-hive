import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_SESSION_FEES } from '@/lib/orgPricing'
import { normalizeOrgTier } from '@/lib/planRules'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { assignment_id } = body || {}
  if (!assignment_id) return jsonError('assignment_id is required')

  const { data: athleteProfile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.user.id)
    .maybeSingle()
  const stripeCustomerId = athleteProfile?.stripe_customer_id || null

  const { data: assignment } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('*')
    .eq('id', assignment_id)
    .maybeSingle()

  if (!assignment) return jsonError('Assignment not found', 404)
  if (!(await userOwnsAthleteProfile(supabaseAdmin, session.user.id, assignment.athlete_id))) return jsonError('Forbidden', 403)
  if (assignment.status === 'paid') return jsonError('Fee already paid', 400)

  const { data: feeRow } = await supabaseAdmin
    .from('org_fees')
    .select('*')
    .eq('id', assignment.fee_id)
    .maybeSingle()

  if (!feeRow) return jsonError('Fee not found', 404)

  if (role === 'athlete') {
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('stripe_account_id, plan')
    .eq('org_id', feeRow.org_id)
    .maybeSingle()

  if (!orgSettings?.stripe_account_id) {
    return jsonError('Organization must connect Stripe before accepting payments.', 400)
  }

  const amount = Math.round(Number(assignment.amount ?? (feeRow.amount_cents ? Number(feeRow.amount_cents) / 100 : feeRow.amount) ?? 0) * 100)
  if (!amount || amount <= 0) return jsonError('Invalid fee amount', 400)

  const orgTier = normalizeOrgTier(orgSettings?.plan)

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: Math.round(amount * (ORG_SESSION_FEES[orgTier] / 100)),
      transfer_data: {
        destination: orgSettings.stripe_account_id,
      },
      ...(stripeCustomerId ? { customer: stripeCustomerId, setup_future_usage: 'on_session' as const } : {}),
      metadata: {
        assignmentId: assignment.id,
        assignment_id: assignment.id,
        feeId: feeRow.id,
        fee_id: feeRow.id,
        orgId: feeRow.org_id,
        org_id: feeRow.org_id,
        athleteId: assignment.athlete_id,
        athlete_profile_id: assignment.athlete_id,
      },
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to create payment intent', 500)
  }
}
