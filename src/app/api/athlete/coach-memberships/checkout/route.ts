import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { checkGuardianApproval, guardianApprovalBlockedResponse } from '@/lib/guardianApproval'
import { FeeTier, getFeePercentage } from '@/lib/platformFees'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'

type MembershipPlanRow = {
  id: string
  coach_id: string
  name: string
  description?: string | null
  price_cents: number
  currency?: string | null
  billing_interval?: string | null
  included_sessions?: number | null
  stripe_price_id?: string | null
  status?: string | null
}

const getBaseUrl = (request: Request) => {
  const requestUrl = new URL(request.url)
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || `${requestUrl.protocol}//${requestUrl.host}`
}

const sanitizeReturnTo = (value: unknown, baseUrl: string) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return '/athlete/marketplace'
  if (raw.startsWith('/')) return raw.startsWith('//') ? '/athlete/marketplace' : raw
  try {
    const parsed = new URL(raw)
    if (parsed.origin !== baseUrl) return '/athlete/marketplace'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/athlete/marketplace'
  }
}

const appendCheckoutParam = (path: string, key: string) => {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${key}=1`
}

const resolveMembershipFeePercent = async (coachId: string) => {
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
  return getFeePercentage(tier, 'session', feeRuleRows || [])
}

export async function POST(request: Request) {
  // Use getUser() (fresh server round-trip) + DB role check instead of JWT metadata,
  // because the middleware client can refresh the JWT without the route-handler cookie
  // store seeing the update (auth-helpers / Next 14 App Router cookie forwarding gap).
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const athleteId = session.user.id

  const { data: actorProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', athleteId)
    .maybeSingle()

  if (!actorProfile || actorProfile.role !== 'athlete') {
    return jsonError('Forbidden', 403)
  }
  const body = await request.json().catch(() => ({}))
  const planId = typeof body?.plan_id === 'string' ? body.plan_id.trim() : ''
  if (!planId) return jsonError('Membership plan is required.', 400)

  const { data: plan, error: planError } = await supabaseAdmin
    .from('coach_membership_plans')
    .select('id, coach_id, name, description, price_cents, currency, billing_interval, included_sessions, stripe_price_id, status')
    .eq('id', planId)
    .maybeSingle()

  if (planError) return jsonError('Unable to load membership plan.', 500)
  if (!plan) return jsonError('Membership plan not found.', 404)

  const membershipPlan = plan as MembershipPlanRow
  if (membershipPlan.status !== 'active') {
    return jsonError('This membership is not available yet.', 400)
  }
  if (!membershipPlan.stripe_price_id) {
    return jsonError('This membership is missing a Stripe price.', 400)
  }

  const { data: existingSubscription } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .select('id, status, stripe_subscription_id')
    .eq('plan_id', membershipPlan.id)
    .eq('athlete_id', athleteId)
    .maybeSingle()

  const existingStatus = String(existingSubscription?.status || '').toLowerCase()
  if (['trialing', 'active', 'past_due', 'paused'].includes(existingStatus)) {
    return jsonError('You already have this membership.', 409)
  }

  const guardianCheck = await checkGuardianApproval({
    athleteId,
    targetType: 'coach',
    targetId: membershipPlan.coach_id,
    scope: 'transactions',
  })
  if (!guardianCheck.allowed) {
    return guardianApprovalBlockedResponse({
      scope: 'transactions',
      targetType: 'coach',
      targetId: membershipPlan.coach_id,
      pending: guardianCheck.pending,
      approvalId: guardianCheck.approvalId,
    })
  }

  const [{ data: coachProfile, error: coachError }, { data: athleteProfile }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('full_name, stripe_account_id')
      .eq('id', membershipPlan.coach_id)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', athleteId)
      .maybeSingle(),
  ])

  if (coachError) return jsonError('Unable to load coach payout account.', 500)
  if (!coachProfile?.stripe_account_id) {
    return jsonError('Coach must connect Stripe before accepting memberships.', 400)
  }

  const baseUrl = getBaseUrl(request)
  const returnTo = sanitizeReturnTo(body?.return_to || body?.returnTo, baseUrl)
  const feePercent = await resolveMembershipFeePercent(membershipPlan.coach_id)
  const metadata = {
    source: 'coach_membership',
    athlete_id: athleteId,
    coach_id: membershipPlan.coach_id,
    membership_plan_id: membershipPlan.id,
    stripe_price_id: membershipPlan.stripe_price_id,
    included_sessions: String(membershipPlan.included_sessions || 0),
    platform_fee_percent: String(feePercent),
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: athleteId,
      line_items: [{ price: membershipPlan.stripe_price_id, quantity: 1 }],
      success_url: `${baseUrl}${appendCheckoutParam(returnTo, 'membership_success')}`,
      cancel_url: `${baseUrl}${appendCheckoutParam(returnTo, 'membership_cancelled')}`,
      ...(athleteProfile?.stripe_customer_id ? { customer: athleteProfile.stripe_customer_id } : {}),
      subscription_data: {
        application_fee_percent: feePercent,
        transfer_data: {
          destination: coachProfile.stripe_account_id,
        },
        metadata,
      },
      metadata,
    })

    await supabaseAdmin
      .from('coach_membership_subscriptions')
      .upsert(
        {
          plan_id: membershipPlan.id,
          coach_id: membershipPlan.coach_id,
          athlete_id: athleteId,
          stripe_customer_id: athleteProfile?.stripe_customer_id || null,
          stripe_checkout_session_id: checkoutSession.id,
          status: 'incomplete',
        },
        { onConflict: 'plan_id,athlete_id' },
      )

    return NextResponse.json({ url: checkoutSession.url })
  } catch (stripeError) {
    const message = stripeError instanceof Error ? stripeError.message : 'Unable to create membership checkout.'
    return jsonError(message, 500)
  }
}
