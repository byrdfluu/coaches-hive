import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier, normalizeSchoolTier } from '@/lib/planRules'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getReleaseOpsConfig, isFeatureEnabledForSubject } from '@/lib/releaseOps'
import { queueOperationTaskSafely } from '@/lib/operations'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import { getPostHogClient } from '@/lib/posthog-server'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { getTrialChargeTimestamp } from '@/lib/stripeTrialTiming'
import type Stripe from 'stripe'

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

const getTrialDays = (role: BillingRole) => (role === 'org' ? 14 : 7)

const resolveBillingRole = (role?: string | null): BillingRole | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role && ORG_ROLES.has(role)) return 'org'
  return null
}

const SCHOOL_ROLES = new Set(['school_admin', 'athletic_director', 'program_director'])

const normalizeTierForRole = (role: BillingRole, tier?: string | null, sessionRole?: string) => {
  if (role === 'coach') return normalizeCoachTier(tier)
  if (role === 'athlete') return normalizeAthleteTier(tier)
  // School roles use a separate tier track.
  if (sessionRole && SCHOOL_ROLES.has(sessionRole)) return normalizeSchoolTier(tier)
  return normalizeOrgTier(tier)
}

const isSchoolSessionRole = (sessionRole?: string) =>
  Boolean(sessionRole && SCHOOL_ROLES.has(sessionRole))

const getPriceId = (role: BillingRole, tier: string, schoolRole?: boolean) => {
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
    org: schoolRole
      ? {
          starter: ['STRIPE_PRICE_SCHOOL_STARTER_MONTHLY'],
          program: ['STRIPE_PRICE_SCHOOL_PROGRAM_MONTHLY'],
          district: ['STRIPE_PRICE_SCHOOL_DISTRICT_MONTHLY'],
        }
      : {
          standard: ['STRIPE_PRICE_ORG_STANDARD_MONTHLY', 'STRIPE_PRICE_ORG_BASIC_MONTHLY'],
          growth: ['STRIPE_PRICE_ORG_GROWTH_MONTHLY', 'STRIPE_PRICE_ORG_PRO_MONTHLY'],
          enterprise: ['STRIPE_PRICE_ORG_ENTERPRISE_MONTHLY', 'STRIPE_PRICE_ORG_ELITE_MONTHLY'],
        },
  }

  const candidates = keysByRoleAndTier[role]?.[tier] || []
  for (const key of candidates) {
    const value = process.env[key]
    if (value) {
      return { priceId: value, keysTried: candidates }
    }
  }
  return { priceId: null, keysTried: candidates }
}

const getBaseUrl = (request: Request) => {
  const requestUrl = new URL(request.url)
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || `${requestUrl.protocol}//${requestUrl.host}`
}

const safeServerError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status })

const sanitizeReturnTo = (value: unknown, baseUrl: string) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? null : raw
  }
  try {
    const parsed = new URL(raw)
    if (parsed.origin !== baseUrl) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

const hasTrialOnSubscription = (subscription: Stripe.Subscription) =>
  Boolean(subscription.trial_start || subscription.trial_end || subscription.metadata?.trial_applied === 'true')

// Check if a Stripe customer has already used a trial for the given billing role (any tier).
const findTrialByCustomer = async ({
  customerId,
  role,
}: {
  customerId: string
  role: BillingRole
}) => {
  let startingAfter: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const subscription of result.data) {
      const md = subscription.metadata || {}
      const mdRole = String(md.billing_role || '')
      if (mdRole === role && hasTrialOnSubscription(subscription)) {
        return true
      }
    }
    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }
  return false
}

// Fallback: scan all subscriptions by metadata when no customer ID is known.
const findTrialByMetadata = async ({
  role,
  userId,
  orgId,
}: {
  role: BillingRole
  userId: string
  orgId?: string | null
}) => {
  let startingAfter: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const subscription of result.data) {
      const md = subscription.metadata || {}
      const mdRole = String(md.billing_role || '')
      if (mdRole !== role) continue
      if (role === 'coach' && String(md.user_id || '') !== userId) continue
      if (role === 'org' && String(md.org_id || '') !== String(orgId || '')) continue
      if (hasTrialOnSubscription(subscription)) return true
    }
    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }
  return false
}

// Returns true if this user/org has already received a trial subscription for the role.
const hasUsedAnyTrial = async ({
  role,
  userId,
  orgId,
}: {
  role: BillingRole
  userId: string
  orgId?: string | null
}) => {
  if (role === 'coach' || role === 'athlete') {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle()
    if (profile?.stripe_customer_id) {
      const foundByCustomer = await findTrialByCustomer({ customerId: profile.stripe_customer_id, role })
      if (foundByCustomer) return true
    }
    return findTrialByMetadata({ role, userId })
  }
  if (role === 'org') {
    if (!orgId) return true // conservative: no trial without a known org
    return findTrialByMetadata({ role, userId, orgId })
  }
  return false
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
  const roleState = getSessionRoleState(session.user.user_metadata)

  const sessionRole = String(role || '')
  const body = await request.json().catch(() => null)
  const requestedRole = String(body?.role || '').trim()
  const rawTier = String(body?.tier || '').trim()
  const portal = String(body?.portal || '').trim()
  const baseUrl = getBaseUrl(request)
  const returnTo = sanitizeReturnTo(body?.returnTo, baseUrl)
  if (!rawTier) {
    trackServerFlowEvent({
      flow: 'subscription_checkout',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: sessionRole,
      metadata: { reason: 'missing_tier' },
    })
    return jsonError('tier is required', 400)
  }

  let checkoutRole = sessionRole
  let existingMembership: { org_id?: string | null; role?: string | null; status?: string | null } | null = null

  if (requestedRole && requestedRole !== sessionRole) {
    if (ORG_ROLES.has(requestedRole)) {
      const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('org_id, role, status')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existingMembership = membership || null
      if (!existingMembership?.org_id || !existingMembership?.role || existingMembership.status === 'suspended') {
        trackServerFlowEvent({
          flow: 'subscription_checkout',
          step: 'membership_check',
          status: 'failed',
          userId: session.user.id,
          role: requestedRole,
          metadata: { reason: 'missing_org_membership' },
        })
        return jsonError('Organization membership required for org checkout', 400)
      }
      checkoutRole = requestedRole
    } else if (requestedRole === 'coach' || requestedRole === 'athlete') {
      const allowedRoles = new Set(roleState.availableRoles)
      if (!allowedRoles.has(requestedRole)) {
        trackServerFlowEvent({
          flow: 'subscription_checkout',
          step: 'role_check',
          status: 'failed',
          userId: session.user.id,
          role: requestedRole,
          metadata: { reason: 'role_not_allowed' },
        })
        return jsonError('Role not allowed for checkout', 403)
      }
      checkoutRole = requestedRole
    } else {
      return jsonError('Unsupported role for subscription checkout', 400)
    }
  }

  const billingRole = resolveBillingRole(checkoutRole)
  if (!billingRole) {
    trackServerFlowEvent({
      flow: 'subscription_checkout',
      step: 'role_resolve',
      status: 'failed',
      userId: session.user.id,
      role: checkoutRole,
      metadata: { reason: 'unsupported_billing_role' },
    })
    return jsonError('Unsupported role for subscription checkout', 400)
  }
  const releaseOpsConfig = await getReleaseOpsConfig()
  const hasExplicitPaymentsFlag = releaseOpsConfig.featureFlags.some((flag) => flag.key === 'payments_enabled')
  const paymentsEnabled = hasExplicitPaymentsFlag
    ? isFeatureEnabledForSubject({
        config: releaseOpsConfig,
        key: 'payments_enabled',
        subject: session.user.id,
      })
    : true
  if (!paymentsEnabled) {
    console.error('[checkout] payments_enabled flag is false for user', session.user.id)
    trackServerFlowEvent({
      flow: 'subscription_checkout',
      step: 'feature_flag',
      status: 'failed',
      userId: session.user.id,
      role: checkoutRole,
      metadata: { reason: 'payments_disabled', billingRole },
    })
    return jsonError('Checkout is temporarily disabled during rollout.', 503)
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    trackServerFlowEvent({
      flow: 'subscription_checkout',
      step: 'config_check',
      status: 'failed',
      userId: session.user.id,
      role: checkoutRole,
      metadata: { reason: 'missing_stripe_secret', billingRole },
    })
    return safeServerError('Billing is not configured. Add STRIPE_SECRET_KEY in Vercel and redeploy.', 500)
  }

  const schoolRole = isSchoolSessionRole(checkoutRole)
  const normalizedTier = normalizeTierForRole(billingRole, rawTier, checkoutRole)
  const { priceId, keysTried } = getPriceId(billingRole, normalizedTier, schoolRole)
  console.log('[checkout] billingRole=%s normalizedTier=%s priceId=%s keysTried=%o', billingRole, normalizedTier, priceId, keysTried)

  if (!priceId) {
    console.error('[checkout] missing price ID — tried:', keysTried)
    trackServerFlowEvent({
      flow: 'subscription_checkout',
      step: 'price_lookup',
      status: 'failed',
      userId: session.user.id,
      role: checkoutRole,
      metadata: {
        billingRole,
        normalizedTier,
        keysTried,
      },
    })
    return safeServerError(
      `Billing is not configured for ${billingRole}:${normalizedTier}. Add one of these Vercel env vars: ${keysTried.join(', ')}`,
      500,
    )
  }

  const redirectRole = billingRole === 'org' ? (ORG_ROLES.has(checkoutRole) ? checkoutRole : 'org_admin') : billingRole
  const portalParam = portal === 'coach' ? '&portal=coach' : ''
  const returnToParam = returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ''
  const metadata: Record<string, string> = {
    user_id: session.user.id,
    billing_role: billingRole,
    tier: normalizedTier,
    role: redirectRole,
  }

  let orgId: string | null = null
  if (billingRole === 'org') {
    orgId = existingMembership?.org_id || null
    if (!orgId) {
      const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      orgId = membership?.org_id || null
    }
    if (!orgId) {
      trackServerFlowEvent({
        flow: 'subscription_checkout',
        step: 'membership_check',
        status: 'failed',
        userId: session.user.id,
        role: checkoutRole,
        metadata: { reason: 'missing_org_id_after_lookup', billingRole },
      })
      return jsonError('Organization membership required for org checkout', 400)
    }
    metadata.org_id = orgId
  }

  // Only apply a trial if the user hasn't used one before.
  const alreadyUsedTrial = await hasUsedAnyTrial({ role: billingRole, userId: session.user.id, orgId })
  const applyTrial = !alreadyUsedTrial
  const trialDays = getTrialDays(billingRole)
  const trialChargeTimestamp = applyTrial
    ? getTrialChargeTimestamp({
        now: new Date(),
        trialDays,
      })
    : null

  // Always bill at the user's selected tier so Stripe shows the correct plan and price.
  const subscriptionMetadata: Record<string, string> = {
    ...metadata,
    tier: normalizedTier,
    trial_applied: applyTrial ? 'true' : 'false',
    trial_days: applyTrial ? String(trialDays) : '0',
    trial_charge_at: trialChargeTimestamp ? new Date(trialChargeTimestamp * 1000).toISOString() : '',
  }

  const idempotencyScope = [
    'v2',
    session.user.id,
    billingRole,
    redirectRole,
    normalizedTier,
    orgId || 'no-org',
    applyTrial ? 'trial' : 'no-trial',
  ].join(':')
  const idempotencyKey = `sub_checkout:${idempotencyScope}`
  trackServerFlowEvent({
    flow: 'subscription_checkout',
    step: 'session_create',
    status: 'started',
    userId: session.user.id,
    role: checkoutRole,
    entityId: orgId,
    metadata: {
      billingRole,
      normalizedTier,
      trialApplied: applyTrial,
    },
  })
  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',
      success_url: `${baseUrl}/checkout?role=${encodeURIComponent(redirectRole)}&tier=${encodeURIComponent(normalizedTier)}&success=1&session_id={CHECKOUT_SESSION_ID}${portalParam}${returnToParam}`,
      cancel_url: `${baseUrl}/checkout?role=${encodeURIComponent(redirectRole)}&tier=${encodeURIComponent(normalizedTier)}&canceled=1${portalParam}${returnToParam}`,
      allow_promotion_codes: true,
      customer_email: session.user.email || undefined,
      client_reference_id: session.user.id,
      metadata: { ...metadata, tier: normalizedTier },
      subscription_data: {
        metadata: subscriptionMetadata,
        ...(applyTrial
          ? {
              trial_end: trialChargeTimestamp ?? undefined,
              trial_settings: {
                end_behavior: {
                  missing_payment_method: 'cancel' as const,
                },
              },
            }
          : {}),
      },
    }, { idempotencyKey })

    trackServerFlowEvent({
      flow: 'subscription_checkout',
      step: 'session_create',
      status: 'succeeded',
      userId: session.user.id,
      role: checkoutRole,
      entityId: orgId,
      metadata: {
        billingRole,
        normalizedTier,
        trialApplied: applyTrial,
        checkoutSessionId: checkoutSession.id,
      },
    })

    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: session.user.id,
      event: 'subscription_checkout_initiated',
      properties: {
        billing_role: billingRole,
        tier: normalizedTier,
        trial_applied: applyTrial,
        trial_days: applyTrial ? trialDays : 0,
        org_id: orgId || null,
      },
    })

    return NextResponse.json({ url: checkoutSession.url, trial_applied: applyTrial, trial_days: applyTrial ? trialDays : 0 })
  } catch (error: any) {
    console.error('[checkout] Stripe error:', error?.message, error)
    trackServerFlowFailure(error, {
      flow: 'subscription_checkout',
      step: 'session_create',
      userId: session.user.id,
      role: checkoutRole,
      entityId: orgId,
      metadata: {
        billingRole,
        normalizedTier,
        trialApplied: applyTrial,
      },
    })
    await queueOperationTaskSafely({
      type: 'billing_recovery',
      title: 'Stripe subscription checkout session creation failed',
      priority: 'high',
      owner: 'Finance Ops',
      entity_type: 'user',
      entity_id: session.user.id,
      max_attempts: 3,
      idempotency_key: idempotencyKey,
      last_error: error?.message || 'checkout session creation failed',
      metadata: {
        role: billingRole,
        tier: normalizedTier,
      },
    })
    return safeServerError(
      error?.message || 'Unable to start checkout. Verify Stripe product, price, and checkout configuration.',
      500,
    )
  }
}
