import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'superadmin']
const VALID_STATUSES = new Set(['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'expired'])

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
  updated_at?: string | null
}

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

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const loadMembershipDataset = async (request: Request) => {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
  const statusFilter = String(url.searchParams.get('status') || 'all').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 500)

  let subscriptionQuery = supabaseAdmin
    .from('coach_membership_subscriptions')
    .select(
      'id, plan_id, coach_id, athlete_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (VALID_STATUSES.has(statusFilter)) {
    subscriptionQuery = subscriptionQuery.eq('status', statusFilter)
  } else if (statusFilter === 'failed') {
    subscriptionQuery = subscriptionQuery.in('status', ['past_due', 'unpaid'])
  } else if (statusFilter === 'cancellations') {
    subscriptionQuery = subscriptionQuery.or('status.eq.canceled,cancel_at_period_end.eq.true')
  }

  const { data: subscriptionRows, error: subscriptionError } = await subscriptionQuery
  if (subscriptionError) throw subscriptionError

  const subscriptions = (subscriptionRows || []) as SubscriptionRow[]
  const subscriptionIds = subscriptions.map((row) => row.id)
  const planIds = Array.from(new Set(subscriptions.map((row) => row.plan_id).filter(Boolean)))
  const profileIds = Array.from(new Set(subscriptions.flatMap((row) => [row.coach_id, row.athlete_id]).filter(Boolean)))

  const [{ data: planRows }, { data: profileRows }, { data: entitlementRows }, { data: usageRows }] = await Promise.all([
    planIds.length
      ? supabaseAdmin
        .from('coach_membership_plans')
        .select('id, name, price_cents, currency, billing_interval, included_sessions, member_only_access, status')
        .in('id', planIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', profileIds)
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
        .select('id, subscription_id, athlete_id, coach_id, session_id, usage_type, quantity, notes, created_at')
        .in('subscription_id', subscriptionIds)
        .order('created_at', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [] }),
  ])

  const planMap = new Map(((planRows || []) as Array<Record<string, any>>).map((plan) => [plan.id, plan]))
  const profileMap = new Map(((profileRows || []) as Array<Record<string, any>>).map((profile) => [profile.id, profile]))
  const entitlementsBySubscription = new Map<string, Array<Record<string, any>>>()
  ;((entitlementRows || []) as Array<Record<string, any>>).forEach((entitlement) => {
    const rows = entitlementsBySubscription.get(entitlement.subscription_id) || []
    rows.push(entitlement)
    entitlementsBySubscription.set(entitlement.subscription_id, rows)
  })

  const memberships = subscriptions.map((subscription) => {
    const plan = planMap.get(subscription.plan_id)
    const coach = profileMap.get(subscription.coach_id)
    const athlete = profileMap.get(subscription.athlete_id)
    const entitlements = entitlementsBySubscription.get(subscription.id) || []
    const creditTotal = entitlements.reduce((sum, entitlement) => sum + toNumber(entitlement.quantity), 0)
    const creditUsed = entitlements.reduce((sum, entitlement) => sum + toNumber(entitlement.used_quantity), 0)
    return {
      id: subscription.id,
      plan_id: subscription.plan_id,
      plan_name: plan?.name || 'Membership plan',
      coach_id: subscription.coach_id,
      coach_name: coach?.full_name || coach?.email || 'Coach',
      coach_email: coach?.email || null,
      athlete_id: subscription.athlete_id,
      athlete_name: athlete?.full_name || athlete?.email || 'Athlete',
      athlete_email: athlete?.email || null,
      status: subscription.status,
      current_period_start: subscription.current_period_start || null,
      current_period_end: subscription.current_period_end || null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      canceled_at: subscription.canceled_at || null,
      stripe_customer_id: subscription.stripe_customer_id || null,
      stripe_subscription_id: subscription.stripe_subscription_id || null,
      price_cents: toNumber(plan?.price_cents),
      currency: plan?.currency || 'usd',
      billing_interval: plan?.billing_interval || 'month',
      credit_total: creditTotal,
      credit_used: creditUsed,
      credit_remaining: Math.max(0, creditTotal - creditUsed),
      created_at: subscription.created_at || null,
      updated_at: subscription.updated_at || null,
    }
  }).filter((membership) => {
    if (!query) return true
    const haystack = `${membership.coach_name} ${membership.coach_email || ''} ${membership.athlete_name} ${membership.athlete_email || ''} ${membership.plan_name} ${membership.status}`
      .toLowerCase()
    return haystack.includes(query)
  })

  const failedPayments = memberships.filter((membership) => ['past_due', 'unpaid'].includes(String(membership.status).toLowerCase()))
  const cancellations = memberships.filter((membership) => String(membership.status).toLowerCase() === 'canceled' || membership.cancel_at_period_end)
  const active = memberships.filter((membership) => ['active', 'trialing'].includes(String(membership.status).toLowerCase()))

  return {
    memberships,
    usage: (usageRows || []).map((row: any) => ({
      id: row.id,
      subscription_id: row.subscription_id,
      athlete_id: row.athlete_id,
      coach_id: row.coach_id,
      session_id: row.session_id || null,
      usage_type: row.usage_type,
      quantity: toNumber(row.quantity),
      notes: row.notes || null,
      created_at: row.created_at || null,
    })),
    metrics: {
      total: memberships.length,
      active: active.length,
      failed_payments: failedPayments.length,
      cancellations: cancellations.length,
      remaining_credits: memberships.reduce((sum, membership) => sum + membership.credit_remaining, 0),
      used_credits: memberships.reduce((sum, membership) => sum + membership.credit_used, 0),
      monthly_revenue_cents: active.reduce((sum, membership) => sum + membership.price_cents, 0),
    },
  }
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  try {
    const payload = await loadMembershipDataset(request)
    return NextResponse.json(payload)
  } catch (caughtError: any) {
    if (isMissingMembershipSchema(caughtError?.message)) {
      return NextResponse.json({ memberships: [], usage: [], metrics: null, setup_required: true })
    }
    return jsonError(caughtError?.message || 'Unable to load memberships.', 500)
  }
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '').trim()
  const subscriptionId = String(body?.subscription_id || '').trim()
  if (!subscriptionId) return jsonError('subscription_id is required.')

  const { data: subscription } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .select('id, coach_id, athlete_id, status')
    .eq('id', subscriptionId)
    .maybeSingle()

  if (!subscription) return jsonError('Membership subscription not found.', 404)

  if (action === 'update_status') {
    const status = String(body?.status || '').trim().toLowerCase()
    if (!VALID_STATUSES.has(status)) return jsonError('Invalid membership status.')
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'canceled') {
      updates.canceled_at = new Date().toISOString()
      updates.cancel_at_period_end = false
    }
    const { error: updateError } = await supabaseAdmin
      .from('coach_membership_subscriptions')
      .update(updates)
      .eq('id', subscriptionId)
    if (updateError) return jsonError(updateError.message, 500)
    return NextResponse.json({ ok: true })
  }

  if (action === 'adjust_credits') {
    const delta = Number.parseInt(String(body?.credit_delta || '0'), 10)
    const notes = String(body?.notes || '').trim().slice(0, 500)
    if (!Number.isFinite(delta) || delta === 0) return jsonError('credit_delta must be a non-zero number.')

    const { data: entitlement } = await supabaseAdmin
      .from('coach_membership_entitlements')
      .select('id, subscription_id, coach_id, athlete_id, quantity, used_quantity, period_start, period_end')
      .eq('subscription_id', subscriptionId)
      .eq('entitlement_type', 'session_credit')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!entitlement?.id) return jsonError('No current entitlement found for this subscription.', 404)

    const nextQuantity = Math.max(Number(entitlement.used_quantity || 0), Number(entitlement.quantity || 0) + delta)
    const { error: entitlementError } = await supabaseAdmin
      .from('coach_membership_entitlements')
      .update({
        quantity: nextQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entitlement.id)

    if (entitlementError) return jsonError(entitlementError.message, 500)

    await supabaseAdmin.from('coach_membership_usage').insert({
      entitlement_id: entitlement.id,
      subscription_id: subscriptionId,
      coach_id: subscription.coach_id,
      athlete_id: subscription.athlete_id,
      usage_type: 'manual_adjustment',
      quantity: Math.abs(delta),
      notes: notes || `Admin ${delta > 0 ? 'added' : 'removed'} ${Math.abs(delta)} membership credit(s).`,
    })

    return NextResponse.json({ ok: true })
  }

  return jsonError('Unsupported action.')
}
