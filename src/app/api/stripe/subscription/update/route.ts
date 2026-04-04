import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { queueOperationTaskSafely } from '@/lib/operations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

type BillingRole = 'coach' | 'athlete' | 'org'

const resolveBillingRole = (role?: string | null): BillingRole | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role && ORG_ROLES.has(role)) return 'org'
  return null
}

const normalizeTierForRole = (role: BillingRole, tier?: string | null) => {
  if (role === 'coach') return normalizeCoachTier(tier)
  if (role === 'athlete') return normalizeAthleteTier(tier)
  return normalizeOrgTier(tier)
}

const getPriceId = (role: BillingRole, tier: string): { priceId: string | null; keysTried: string[] } => {
  const keysByRoleAndTier: Record<BillingRole, Record<string, string[]>> = {
    coach: {
      starter: ['STRIPE_PRICE_COACH_STARTER_MONTHLY', 'STRIPE_PRICE_COACH_BASIC_MONTHLY'],
      pro: ['STRIPE_PRICE_COACH_PRO_MONTHLY'],
      elite: ['STRIPE_PRICE_COACH_ELITE_MONTHLY'],
    },
    athlete: {
      explore: ['STRIPE_PRICE_ATHLETE_EXPLORE_MONTHLY', 'STRIPE_PRICE_ATHLETE_BASIC_MONTHLY'],
      train: ['STRIPE_PRICE_ATHLETE_TRAIN_MONTHLY', 'STRIPE_PRICE_ATHLETE_PRO_MONTHLY'],
      family: ['STRIPE_PRICE_ATHLETE_FAMILY_MONTHLY', 'STRIPE_PRICE_ATHLETE_ELITE_MONTHLY'],
    },
    org: {
      standard: ['STRIPE_PRICE_ORG_STANDARD_MONTHLY', 'STRIPE_PRICE_ORG_BASIC_MONTHLY'],
      growth: ['STRIPE_PRICE_ORG_GROWTH_MONTHLY', 'STRIPE_PRICE_ORG_PRO_MONTHLY'],
      enterprise: ['STRIPE_PRICE_ORG_ENTERPRISE_MONTHLY', 'STRIPE_PRICE_ORG_ELITE_MONTHLY'],
    },
  }
  const candidates = keysByRoleAndTier[role]?.[tier] || []
  for (const key of candidates) {
    const value = process.env[key]
    if (value) return { priceId: value, keysTried: candidates }
  }
  return { priceId: null, keysTried: candidates }
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    'coach',
    'athlete',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
    'admin',
  ])
  if (error || !session) return error

  const billingRole = resolveBillingRole(String(role || ''))
  if (!billingRole) {
    return jsonError('Unsupported role for subscription update', 400)
  }

  const body = await request.json().catch(() => null)
  const rawTier = String(body?.tier || '').trim()
  if (!rawTier) {
    return jsonError('tier is required', 400)
  }

  const normalizedTier = normalizeTierForRole(billingRole, rawTier)
  const { priceId, keysTried } = getPriceId(billingRole, normalizedTier)
  if (!priceId) {
    return jsonError(
      `Missing Stripe price ID for ${billingRole}:${normalizedTier}. Set one of: ${keysTried.join(', ')}`,
      500,
    )
  }

  // Resolve org ID if needed.
  let orgId: string | null = null
  if (billingRole === 'org') {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .maybeSingle()
    orgId = membership?.org_id || null
    if (!orgId) {
      return jsonError('Organization membership required for org plan update', 400)
    }
  }

  // Look up the user's Stripe customer ID.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!profile?.stripe_customer_id) {
    return jsonError('No billing account found. Please complete the checkout flow first.', 404)
  }

  // Find the active or trialing subscription for this billing role.
  let targetSubscription: any = null
  let startingAfter: string | undefined
  outer: for (let page = 0; page < 5; page += 1) {
    const result = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const sub of result.data) {
      if (sub.status !== 'active' && sub.status !== 'trialing') continue
      const md = (sub.metadata || {}) as Record<string, string>
      const mdRole = String(md.billing_role || '')
      if (mdRole === billingRole) {
        targetSubscription = sub
        break outer
      }
    }
    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  if (!targetSubscription) {
    return jsonError('No active subscription found for this role. Please complete the checkout flow first.', 404)
  }

  const subscriptionItemId = targetSubscription.items?.data?.[0]?.id
  if (!subscriptionItemId) {
    return jsonError('Subscription item not found. Please contact support.', 500)
  }

  // Check if already on this tier.
  const currentTier = normalizeTierForRole(billingRole, targetSubscription.metadata?.tier)
  if (currentTier === normalizedTier) {
    return jsonError(`You are already on the ${normalizedTier} plan.`, 400)
  }

  const idempotencyKey = `sub_update:${session.user.id}:${billingRole}:${normalizedTier}:${targetSubscription.id}`

  try {
    // Update the Stripe subscription to the new tier with proration.
    await stripe.subscriptions.update(
      targetSubscription.id,
      {
        items: [{ id: subscriptionItemId, price: priceId }],
        proration_behavior: 'create_prorations',
        metadata: {
          ...targetSubscription.metadata,
          tier: normalizedTier,
        },
      },
      { idempotencyKey },
    )
  } catch (err: any) {
    await queueOperationTaskSafely({
      type: 'billing_recovery',
      title: 'Stripe subscription update failed',
      priority: 'high',
      owner: 'Finance Ops',
      entity_type: 'user',
      entity_id: session.user.id,
      max_attempts: 3,
      idempotency_key: idempotencyKey,
      last_error: err?.message || 'subscription update failed',
      metadata: { billing_role: billingRole, tier: normalizedTier },
    })
    return jsonError(err?.message || 'Unable to update subscription', 500)
  }

  // Sync the new tier to the local database.
  if (billingRole === 'coach') {
    await supabaseAdmin
      .from('coach_plans')
      .upsert({ coach_id: session.user.id, tier: normalizedTier }, { onConflict: 'coach_id' })
  } else if (billingRole === 'athlete') {
    await supabaseAdmin
      .from('athlete_plans')
      .upsert({ athlete_id: session.user.id, tier: normalizedTier }, { onConflict: 'athlete_id' })
  } else if (billingRole === 'org' && orgId) {
    await supabaseAdmin
      .from('org_settings')
      .upsert(
        { org_id: orgId, plan: normalizedTier, plan_status: normalizeOrgStatus('active') },
        { onConflict: 'org_id' },
      )
  }

  // Update user metadata so lifecycle state reflects the new tier.
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(session.user.id)
  const currentMeta = (authUser?.user?.user_metadata || {}) as Record<string, any>
  await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
    user_metadata: { ...currentMeta, selected_tier: normalizedTier },
  })

  return NextResponse.json({ ok: true, tier: normalizedTier })
}
