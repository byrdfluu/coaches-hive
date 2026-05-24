import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const isMissingMembershipSchema = (message?: string | null) => {
  const value = String(message || '').toLowerCase()
  return (
    value.includes('coach_membership_')
    && (
      value.includes('does not exist')
      || value.includes('schema cache')
      || value.includes('could not find')
    )
  )
}

const parsePriceCents = (value: unknown) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.round(value * 100)
  }
  const cleaned = String(value || '').replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

const formatSchemaError = () =>
  'Coach memberships are not configured yet. Run the coach membership Supabase migration first.'

type MembershipPlanRow = {
  id: string
  coach_id: string
  name: string
  description?: string | null
  price_cents: number
  currency: string
  billing_interval: string
  included_sessions: number
  member_only_access?: boolean | null
  stripe_product_id?: string | null
  stripe_price_id?: string | null
  status: string
  created_at?: string | null
  updated_at?: string | null
}

type MembershipSubscriptionRow = {
  id: string
  plan_id: string
  coach_id: string
  athlete_id: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  status: string
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean | null
  canceled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const createStripeMembershipPrice = async ({
  coachId,
  planId,
  name,
  description,
  priceCents,
  includedSessions,
  stripeProductId,
}: {
  coachId: string
  planId: string
  name: string
  description: string
  priceCents: number
  includedSessions: number
  stripeProductId?: string | null
}) => {
  let productId = stripeProductId || null

  if (productId) {
    await stripe.products.update(productId, {
      name,
      description: description || undefined,
      metadata: {
        source: 'coach_membership',
        coach_id: coachId,
        membership_plan_id: planId,
      },
    })
  } else {
    const product = await stripe.products.create({
      name,
      description: description || undefined,
      metadata: {
        source: 'coach_membership',
        coach_id: coachId,
        membership_plan_id: planId,
      },
    })
    productId = product.id
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: priceCents,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: {
      source: 'coach_membership',
      coach_id: coachId,
      membership_plan_id: planId,
      included_sessions: String(includedSessions),
    },
  })

  return { stripeProductId: productId, stripePriceId: price.id }
}

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { data: planRows, error: fetchError } = await supabaseAdmin
    .from('coach_membership_plans')
    .select(
      'id, coach_id, name, description, price_cents, currency, billing_interval, included_sessions, member_only_access, stripe_product_id, stripe_price_id, status, created_at, updated_at',
    )
    .eq('coach_id', session.user.id)
    .order('created_at', { ascending: false })

  if (fetchError) {
    if (isMissingMembershipSchema(fetchError.message)) {
      return NextResponse.json({ plans: [], setup_required: true, error: formatSchemaError() })
    }
    return jsonError(fetchError.message, 500)
  }

  const plans = (planRows || []) as MembershipPlanRow[]
  const { data: subscriptionRows, error: subscriptionError } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .select(
      'id, plan_id, coach_id, athlete_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at',
    )
    .eq('coach_id', session.user.id)
    .order('created_at', { ascending: false })

  if (subscriptionError) {
    if (isMissingMembershipSchema(subscriptionError.message)) {
      return NextResponse.json({ plans, setup_required: false, members: [], usage: [], metrics: null })
    }
    return jsonError(subscriptionError.message, 500)
  }

  const subscriptions = (subscriptionRows || []) as MembershipSubscriptionRow[]
  const subscriptionIds = subscriptions.map((row) => row.id)
  const athleteIds = Array.from(new Set(subscriptions.map((row) => row.athlete_id).filter(Boolean)))

  const [{ data: profileRows }, { data: entitlementRows }, { data: usageRows }] = await Promise.all([
    athleteIds.length
      ? supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', athleteIds)
      : Promise.resolve({ data: [] }),
    subscriptionIds.length
      ? supabaseAdmin
        .from('coach_membership_entitlements')
        .select('id, subscription_id, quantity, used_quantity, period_start, period_end, entitlement_type')
        .in('subscription_id', subscriptionIds)
        .eq('entitlement_type', 'session_credit')
      : Promise.resolve({ data: [] }),
    subscriptionIds.length
      ? supabaseAdmin
        .from('coach_membership_usage')
        .select('id, entitlement_id, subscription_id, athlete_id, session_id, usage_type, quantity, notes, created_at')
        .in('subscription_id', subscriptionIds)
        .order('created_at', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [] }),
  ])

  const planMap = new Map(plans.map((plan) => [plan.id, plan]))
  const profileMap = new Map(((profileRows || []) as Array<{ id: string; full_name?: string | null; email?: string | null }>).map((profile) => [profile.id, profile]))
  const entitlementsBySubscription = new Map<string, Array<Record<string, any>>>()
  ;((entitlementRows || []) as Array<Record<string, any>>).forEach((entitlement) => {
    const rows = entitlementsBySubscription.get(entitlement.subscription_id) || []
    rows.push(entitlement)
    entitlementsBySubscription.set(entitlement.subscription_id, rows)
  })

  const activeStatuses = new Set(['active', 'trialing'])
  const issueStatuses = new Set(['past_due', 'unpaid', 'canceled', 'expired'])
  const members = subscriptions.map((subscription) => {
    const plan = planMap.get(subscription.plan_id)
    const profile = profileMap.get(subscription.athlete_id)
    const entitlements = entitlementsBySubscription.get(subscription.id) || []
    const creditTotal = entitlements.reduce((sum, entitlement) => sum + Number(entitlement.quantity || 0), 0)
    const creditUsed = entitlements.reduce((sum, entitlement) => sum + Number(entitlement.used_quantity || 0), 0)
    return {
      id: subscription.id,
      plan_id: subscription.plan_id,
      plan_name: plan?.name || 'Membership plan',
      athlete_id: subscription.athlete_id,
      athlete_name: profile?.full_name || profile?.email || 'Athlete',
      athlete_email: profile?.email || null,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      canceled_at: subscription.canceled_at || null,
      price_cents: plan?.price_cents || 0,
      currency: plan?.currency || 'usd',
      credit_total: creditTotal,
      credit_used: creditUsed,
      credit_remaining: Math.max(0, creditTotal - creditUsed),
      created_at: subscription.created_at || null,
    }
  })

  const usage = ((usageRows || []) as Array<Record<string, any>>).map((row) => {
    const subscription = subscriptions.find((candidate) => candidate.id === row.subscription_id)
    const profile = subscription ? profileMap.get(subscription.athlete_id) : null
    const plan = subscription ? planMap.get(subscription.plan_id) : null
    return {
      id: row.id,
      subscription_id: row.subscription_id,
      athlete_id: row.athlete_id || subscription?.athlete_id || null,
      athlete_name: profile?.full_name || profile?.email || 'Athlete',
      plan_name: plan?.name || 'Membership plan',
      session_id: row.session_id || null,
      usage_type: row.usage_type || 'session_credit',
      quantity: Number(row.quantity || 0),
      notes: row.notes || null,
      created_at: row.created_at || null,
    }
  })

  const activeMembers = members.filter((member) => activeStatuses.has(String(member.status).toLowerCase()))
  const issueMembers = members.filter((member) => {
    const status = String(member.status || '').toLowerCase()
    return issueStatuses.has(status) || member.cancel_at_period_end
  })
  const monthlyRecurringRevenueCents = activeMembers.reduce((sum, member) => sum + Number(member.price_cents || 0), 0)
  const usedCredits = members.reduce((sum, member) => sum + Number(member.credit_used || 0), 0)
  const remainingCredits = members.reduce((sum, member) => sum + Number(member.credit_remaining || 0), 0)

  return NextResponse.json({
    plans,
    members,
    usage,
    metrics: {
      active_members: activeMembers.length,
      total_members: members.length,
      monthly_recurring_revenue_cents: monthlyRecurringRevenueCents,
      used_credits: usedCredits,
      remaining_credits: remainingCredits,
      issue_members: issueMembers.length,
      canceled_or_past_due: issueMembers,
    },
    setup_required: false,
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  const description = String(body?.description || '').trim()
  const status = String(body?.status || 'draft').trim().toLowerCase()
  const priceCents = parsePriceCents(body?.monthly_price)
  const includedSessions = Number.parseInt(String(body?.included_sessions ?? '0'), 10)
  const memberOnlyAccess = Boolean(body?.member_only_access)

  if (!name) return jsonError('Plan name is required.')
  if (status !== 'draft' && status !== 'active') return jsonError('Status must be draft or active.')
  if (!Number.isFinite(includedSessions) || includedSessions < 0) {
    return jsonError('Included sessions must be 0 or greater.')
  }
  if (!priceCents || priceCents <= 0) {
    return jsonError('Monthly price is required.')
  }

  const planId = randomUUID()
  let stripeProductId: string | null = null
  let stripePriceId: string | null = null

  if (status === 'active') {
    const activePriceCents = priceCents || 0
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) return jsonError('Unable to verify Stripe connection.', 500)
    if (!profile?.stripe_account_id) {
      return jsonError('Connect Stripe before publishing membership plans.', 403)
    }

    try {
      const stripeRefs = await createStripeMembershipPrice({
        coachId: session.user.id,
        planId,
        name,
        description,
        priceCents: activePriceCents,
        includedSessions,
      })
      stripeProductId = stripeRefs.stripeProductId
      stripePriceId = stripeRefs.stripePriceId
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : 'Unable to create Stripe membership price.'
      return jsonError(message, 500)
    }
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_membership_plans')
    .insert({
      id: planId,
      coach_id: session.user.id,
      name,
      description: description || null,
      price_cents: priceCents,
      currency: 'usd',
      billing_interval: 'month',
      included_sessions: includedSessions,
      member_only_access: memberOnlyAccess,
      stripe_product_id: stripeProductId,
      stripe_price_id: stripePriceId,
      status,
    })
    .select(
      'id, coach_id, name, description, price_cents, currency, billing_interval, included_sessions, member_only_access, stripe_product_id, stripe_price_id, status, created_at, updated_at',
    )
    .single()

  if (insertError) {
    if (isMissingMembershipSchema(insertError.message)) {
      return jsonError(formatSchemaError(), 500)
    }
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ ok: true, plan: data })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const planId = String(body?.id || '').trim()
  const name = String(body?.name || '').trim()
  const description = String(body?.description || '').trim()
  const status = String(body?.status || 'draft').trim().toLowerCase()
  const priceCents = parsePriceCents(body?.monthly_price)
  const includedSessions = Number.parseInt(String(body?.included_sessions ?? '0'), 10)
  const memberOnlyAccess = Boolean(body?.member_only_access)

  if (!planId) return jsonError('Plan id is required.')
  if (!name) return jsonError('Plan name is required.')
  if (status !== 'draft' && status !== 'active') return jsonError('Status must be draft or active.')
  if (!Number.isFinite(includedSessions) || includedSessions < 0) {
    return jsonError('Included sessions must be 0 or greater.')
  }
  if (!priceCents || priceCents <= 0) {
    return jsonError('Monthly price is required.')
  }

  const { data: existingPlan, error: fetchError } = await supabaseAdmin
    .from('coach_membership_plans')
    .select('id, coach_id, name, description, price_cents, included_sessions, stripe_product_id, stripe_price_id, status')
    .eq('id', planId)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (fetchError) {
    if (isMissingMembershipSchema(fetchError.message)) return jsonError(formatSchemaError(), 500)
    return jsonError(fetchError.message, 500)
  }
  if (!existingPlan) return jsonError('Membership plan not found.', 404)

  let stripeProductId = existingPlan.stripe_product_id || null
  let stripePriceId = existingPlan.stripe_price_id || null

  if (status === 'active') {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) return jsonError('Unable to verify Stripe connection.', 500)
    if (!profile?.stripe_account_id) {
      return jsonError('Connect Stripe before publishing membership plans.', 403)
    }

    const needsNewPrice =
      !stripePriceId
      || Number(existingPlan.price_cents || 0) !== priceCents
      || Number(existingPlan.included_sessions || 0) !== includedSessions

    try {
      if (needsNewPrice) {
        const stripeRefs = await createStripeMembershipPrice({
          coachId: session.user.id,
          planId,
          name,
          description,
          priceCents,
          includedSessions,
          stripeProductId,
        })
        stripeProductId = stripeRefs.stripeProductId
        stripePriceId = stripeRefs.stripePriceId
      } else if (stripeProductId) {
        await stripe.products.update(stripeProductId, {
          name,
          description: description || undefined,
          metadata: {
            source: 'coach_membership',
            coach_id: session.user.id,
            membership_plan_id: planId,
          },
        })
      }
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : 'Unable to update Stripe membership price.'
      return jsonError(message, 500)
    }
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_membership_plans')
    .update({
      name,
      description: description || null,
      price_cents: priceCents,
      currency: 'usd',
      billing_interval: 'month',
      included_sessions: includedSessions,
      member_only_access: memberOnlyAccess,
      stripe_product_id: stripeProductId,
      stripe_price_id: stripePriceId,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
    .eq('coach_id', session.user.id)
    .select(
      'id, coach_id, name, description, price_cents, currency, billing_interval, included_sessions, member_only_access, stripe_product_id, stripe_price_id, status, created_at, updated_at',
    )
    .single()

  if (updateError) {
    if (isMissingMembershipSchema(updateError.message)) return jsonError(formatSchemaError(), 500)
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ ok: true, plan: data })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const planId = String(body?.id || '').trim()
  if (!planId) return jsonError('Plan id is required.')

  const { data: existingPlan, error: fetchError } = await supabaseAdmin
    .from('coach_membership_plans')
    .select('id, coach_id, stripe_product_id, stripe_price_id')
    .eq('id', planId)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (fetchError) return jsonError(fetchError.message, 500)
  if (!existingPlan) return jsonError('Membership plan not found.', 404)

  // Block deletion if any subscriber is currently active
  const { data: activeSubscriptions } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .select('id')
    .eq('plan_id', planId)
    .in('status', ['active', 'trialing', 'past_due'])
    .limit(1)

  if (activeSubscriptions && activeSubscriptions.length > 0) {
    return jsonError('This plan has active subscribers. Cancel or wait for all subscriptions to end before deleting.', 409)
  }

  // Archive Stripe price and product so no new subscriptions can use them
  if (existingPlan.stripe_price_id) {
    try {
      await stripe.prices.update(existingPlan.stripe_price_id, { active: false })
    } catch {
      // Non-fatal — may already be inactive or belong to a different Stripe mode
    }
  }
  if (existingPlan.stripe_product_id) {
    try {
      await stripe.products.update(existingPlan.stripe_product_id, { active: false })
    } catch {
      // Non-fatal
    }
  }

  const { error: deleteError } = await supabaseAdmin
    .from('coach_membership_plans')
    .delete()
    .eq('id', planId)
    .eq('coach_id', session.user.id)

  if (deleteError) return jsonError(deleteError.message, 500)

  return NextResponse.json({ ok: true })
}
