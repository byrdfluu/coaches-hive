import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { FeeTier, getFeePercentage } from '@/lib/platformFees'
import { resolveBaseUrl } from '@/lib/siteUrl'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const type = String(body?.type || '').trim()
  const recordId = String(body?.record_id || '').trim()
  if (type !== 'coach_fee') return jsonError('Unsupported checkout type')
  if (!recordId) return jsonError('record_id is required')

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from('coach_fee_assignments')
    .select('id, coach_id, athlete_id, name, amount, status, stripe_checkout_session_id')
    .eq('id', recordId)
    .maybeSingle()
  if (assignmentError) return jsonError('Unable to load coach fee', 500)
  if (!assignment) return jsonError('Coach fee not found', 404)
  if (!(await userOwnsAthleteProfile(supabaseAdmin, user.id, assignment.athlete_id))) {
    return jsonError('Forbidden', 403)
  }
  if (String(assignment.status || '').toLowerCase() === 'paid') {
    return jsonError('Coach fee is already paid', 409)
  }

  const amountCents = Math.round(Number(assignment.amount || 0) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return jsonError('Coach fee amount is invalid')
  if (amountCents > 5_000_000) return jsonError('Coach fee amount exceeds the maximum allowed')

  const [{ data: coach }, { data: plan }, { data: feeRules }, { data: payer }] = await Promise.all([
    supabaseAdmin.from('profiles').select('stripe_account_id').eq('id', assignment.coach_id).maybeSingle(),
    supabaseAdmin.from('coach_plans').select('tier').eq('coach_id', assignment.coach_id).maybeSingle(),
    supabaseAdmin.from('platform_fee_rules').select('tier, category, percentage').eq('active', true),
    supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', user.id).maybeSingle(),
  ])
  if (!coach?.stripe_account_id) {
    return jsonError('Coach must connect Stripe before accepting payments', 400)
  }

  const tier = (plan?.tier as FeeTier) || 'starter'
  const feeRate = getFeePercentage(tier, 'session', feeRules || [])
  const applicationFeeCents = Math.round(amountCents * feeRate / 100)
  const baseUrl = resolveBaseUrl()
  const returnQuery = `type=coach_fee&id=${encodeURIComponent(assignment.id)}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: assignment.name || 'Coach fee' },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: user.id,
      ...(payer?.stripe_customer_id
        ? { customer: payer.stripe_customer_id }
        : { customer_email: payer?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: coach.stripe_account_id },
        metadata: {
          checkout_type: 'coach_fee',
          assignment_id: assignment.id,
          coach_id: assignment.coach_id,
          athlete_profile_id: assignment.athlete_id,
        },
      },
      metadata: {
        checkout_type: 'coach_fee',
        assignment_id: assignment.id,
        coach_id: assignment.coach_id,
        athlete_profile_id: assignment.athlete_id,
        payer_user_id: user.id,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    const { error: updateError } = await supabaseAdmin
      .from('coach_fee_assignments')
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', assignment.id)
      .neq('status', 'paid')
    if (updateError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      return jsonError('Unable to bind checkout to coach fee', 500)
    }

    return NextResponse.json({
      checkout_url: session.url,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to start coach fee checkout', 500)
  }
}
