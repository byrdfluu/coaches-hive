import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = new Set(['active', 'trialing'])
const RISK_STATUSES = new Set(['past_due', 'unpaid', 'canceled', 'expired'])

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

type SubscriptionRow = {
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
}

export async function GET() {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { data: subscriptionRows, error: subscriptionError } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .select(
      'id, plan_id, coach_id, athlete_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at',
    )
    .eq('athlete_id', session.user.id)
    .order('created_at', { ascending: false })

  if (subscriptionError) {
    if (isMissingMembershipSchema(subscriptionError.message)) {
      return NextResponse.json({ memberships: [], metrics: null, setup_required: true })
    }
    return jsonError(subscriptionError.message, 500)
  }

  const subscriptions = (subscriptionRows || []) as SubscriptionRow[]
  const subscriptionIds = subscriptions.map((row) => row.id)
  const planIds = Array.from(new Set(subscriptions.map((row) => row.plan_id).filter(Boolean)))
  const coachIds = Array.from(new Set(subscriptions.map((row) => row.coach_id).filter(Boolean)))

  const [{ data: planRows }, { data: coachRows }, { data: entitlementRows }] = await Promise.all([
    planIds.length
      ? supabaseAdmin
        .from('coach_membership_plans')
        .select('id, name, description, price_cents, currency, billing_interval, included_sessions, member_only_access')
        .in('id', planIds)
      : Promise.resolve({ data: [] }),
    coachIds.length
      ? supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', coachIds)
      : Promise.resolve({ data: [] }),
    subscriptionIds.length
      ? supabaseAdmin
        .from('coach_membership_entitlements')
        .select('id, subscription_id, quantity, used_quantity, period_start, period_end, entitlement_type')
        .in('subscription_id', subscriptionIds)
        .eq('entitlement_type', 'session_credit')
      : Promise.resolve({ data: [] }),
  ])

  const planMap = new Map(((planRows || []) as Array<Record<string, any>>).map((plan) => [plan.id, plan]))
  const coachMap = new Map(((coachRows || []) as Array<Record<string, any>>).map((coach) => [coach.id, coach]))
  const entitlementsBySubscription = new Map<string, Array<Record<string, any>>>()
  ;((entitlementRows || []) as Array<Record<string, any>>).forEach((entitlement) => {
    const rows = entitlementsBySubscription.get(entitlement.subscription_id) || []
    rows.push(entitlement)
    entitlementsBySubscription.set(entitlement.subscription_id, rows)
  })

  const memberships = subscriptions.map((subscription) => {
    const plan = planMap.get(subscription.plan_id)
    const coach = coachMap.get(subscription.coach_id)
    const entitlements = entitlementsBySubscription.get(subscription.id) || []
    const creditTotal = entitlements.reduce((sum, entitlement) => sum + Number(entitlement.quantity || 0), 0)
    const creditUsed = entitlements.reduce((sum, entitlement) => sum + Number(entitlement.used_quantity || 0), 0)
    const status = String(subscription.status || '').toLowerCase()
    return {
      id: subscription.id,
      plan_id: subscription.plan_id,
      plan_name: plan?.name || 'Coach membership',
      plan_description: plan?.description || null,
      coach_id: subscription.coach_id,
      coach_name: coach?.full_name || coach?.email || 'Coach',
      coach_email: coach?.email || null,
      coach_avatar_url: coach?.avatar_url || null,
      status: subscription.status,
      is_active: ACTIVE_STATUSES.has(status),
      needs_attention: RISK_STATUSES.has(status) || Boolean(subscription.cancel_at_period_end),
      current_period_start: subscription.current_period_start || null,
      current_period_end: subscription.current_period_end || null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      canceled_at: subscription.canceled_at || null,
      stripe_subscription_id: subscription.stripe_subscription_id || null,
      price_cents: Number(plan?.price_cents || 0),
      currency: plan?.currency || 'usd',
      billing_interval: plan?.billing_interval || 'month',
      included_sessions: Number(plan?.included_sessions || 0),
      member_only_access: Boolean(plan?.member_only_access),
      credit_total: creditTotal,
      credit_used: creditUsed,
      credit_remaining: Math.max(0, creditTotal - creditUsed),
      created_at: subscription.created_at || null,
    }
  })

  return NextResponse.json({
    memberships,
    metrics: {
      active_memberships: memberships.filter((membership) => membership.is_active).length,
      total_memberships: memberships.length,
      remaining_credits: memberships.reduce((sum, membership) => sum + membership.credit_remaining, 0),
      used_credits: memberships.reduce((sum, membership) => sum + membership.credit_used, 0),
      needs_attention: memberships.filter((membership) => membership.needs_attention).length,
    },
    setup_required: false,
  })
}
