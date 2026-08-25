import { normalizeTierForBillingRole, type BillingRole } from '@/lib/billingState'
import { ORG_ROLE_SET } from '@/lib/sessionRoleState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ALL_ACCESS_PRICING } from '@/lib/allAccessPricing'
import stripe from '@/lib/stripeServer'
import { getAllAccessPriceKeys, isOrganizationPlanKey, resolveFirstConfiguredPrice } from '@/lib/allAccessPricing'
import { getFeeSettings } from '@/lib/orgPlatformFees'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'

export const PLATFORM_SUBSCRIPTION_STATUSES = [
  'active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired',
] as const

export type PlatformSubscriptionStatus = typeof PLATFORM_SUBSCRIPTION_STATUSES[number]
export type NormalizedPlatformSubscriptionStatus = PlatformSubscriptionStatus | 'inactive'

export const normalizePlatformSubscriptionStatus = (status?: string | null): NormalizedPlatformSubscriptionStatus => {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'active' || value === 'trialing' || value === 'past_due' || value === 'unpaid'
    || value === 'incomplete' || value === 'incomplete_expired') return value
  if (value === 'canceled' || value === 'cancelled') return 'canceled'
  return 'inactive'
}

export const platformSubscriptionHasAccess = ({
  status,
  trialEnd,
}: {
  status?: string | null
  trialEnd?: string | null
}) => {
  const normalized = normalizePlatformSubscriptionStatus(status)
  if (normalized === 'active') return true
  if (normalized !== 'trialing') return false
  return Boolean(trialEnd && new Date(trialEnd).getTime() > Date.now())
}

export type PlatformActor = {
  userId: string
  role: 'coach' | 'athlete' | 'org'
  billingRole: BillingRole
  mobileBillingRole: 'family' | 'independent_coach' | 'org_covered_coach' | 'org_admin'
  organizationId: string | null
  canViewOrgBilling: boolean
}

export const resolvePlatformActor = async (userId: string): Promise<PlatformActor | null> => {
  const [{ data: profile }, { data: personalSubscription }, { data: membership }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle(),
    supabaseAdmin
      .from('platform_subscriptions')
      .select('id,status')
      .eq('owner_type', 'coach')
      .eq('owner_id', userId)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('organization_memberships')
      .select('org_id, role, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // A coach's independently purchased subscription is authoritative for their
  // personal portal even when an organization also sponsors their org access.
  if (String(profile?.role || '') === 'coach' && personalSubscription) {
    return {
      userId, role: 'coach', billingRole: 'coach', mobileBillingRole: 'independent_coach',
      organizationId: null, canViewOrgBilling: false,
    }
  }

  const membershipIsActive = Boolean(membership?.org_id)
    && (!membership?.status || String(membership.status).toLowerCase() === 'active')
  if (membershipIsActive && ORG_ROLE_SET.has(String(membership?.role || ''))) {
    return {
      userId, role: 'org', billingRole: 'org', mobileBillingRole: 'org_admin',
      organizationId: membership!.org_id, canViewOrgBilling: true,
    }
  }
  if (membershipIsActive && ['coach', 'assistant_coach', 'head_coach'].includes(String(membership?.role))) {
    return {
      userId, role: 'org', billingRole: 'org', mobileBillingRole: 'org_covered_coach',
      organizationId: membership!.org_id, canViewOrgBilling: false,
    }
  }

  if (String(profile?.role || '') === 'coach') {
    return {
      userId, role: 'coach', billingRole: 'coach', mobileBillingRole: 'independent_coach',
      organizationId: null, canViewOrgBilling: false,
    }
  }
  if (String(profile?.role || '') === 'athlete') {
    return {
      userId, role: 'athlete', billingRole: 'athlete', mobileBillingRole: 'family',
      organizationId: null, canViewOrgBilling: false,
    }
  }
  return null
}

export const resolvePlatformActorForWorkspace = async (userId: string, workspaceId?: unknown): Promise<PlatformActor | null> => {
  const workspace = await requireWorkspaceContext(userId, workspaceId)
  if (!workspace) return resolvePlatformActor(userId)
  if (workspace.type === 'organization' && workspace.organizationId) {
    const canViewOrgBilling = workspace.roles.some(role => ['owner', 'org_admin'].includes(role))
      || workspace.permissions.manage_billing === true
    return {
      userId, role: 'org', billingRole: 'org',
      mobileBillingRole: canViewOrgBilling ? 'org_admin' : 'org_covered_coach',
      organizationId: workspace.organizationId, canViewOrgBilling,
    }
  }
  if (workspace.type === 'independent_coach' && workspace.ownerUserId === userId) {
    return {
      userId, role: 'coach', billingRole: 'coach', mobileBillingRole: 'independent_coach',
      organizationId: null, canViewOrgBilling: false,
    }
  }
  return null
}

export type PlatformSubscriptionSnapshot = {
  has_access: boolean
  status: string
  tier: string | null
  billing_role?: PlatformActor['mobileBillingRole']
  plan_key?: string | null
  billing_interval?: string | null
  current_period_end?: string | null
  current_period_start?: string | null
  trial_start?: string | null
  trial_end?: string | null
  cancel_at_period_end?: boolean
  canceled_at?: string | null
  currency?: string
  base_amount?: number
  renewal_amount?: number
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_price_id?: string | null
  family_athlete_limit?: number
  covered_athlete_count?: number
  purchase_channel?: 'stripe' | 'apple_iap' | null
  fee_breakdown?: {
    standard_session_fee_rate: number
    high_volume_session_fee_rate: number
    program_fee_rate: number
    org_dues_fee_rate: number
    org_dues_fee_fixed_cents: number
    marketplace_fee_rate: number
    marketplace_fee_cap_cents: number
    stripe_processing_included: boolean
  }
}

export const emptyPlatformSubscriptionSnapshot = (): PlatformSubscriptionSnapshot => ({
  has_access: false,
  status: 'none',
  tier: null,
})

const isoFromUnix = (value?: number | null) => value ? new Date(value * 1000).toISOString() : null

export const getPlatformSubscriptionSnapshot = async (actor: PlatformActor): Promise<PlatformSubscriptionSnapshot> => {
  const feeSettings = await getFeeSettings()
  const feeBreakdown = {
    standard_session_fee_rate: 0.04,
    high_volume_session_fee_rate: 0.04,
    program_fee_rate: 0.04,
    org_dues_fee_rate: 0.04,
    org_dues_fee_fixed_cents: feeSettings.stripeProcessingFeeFixedCents,
    marketplace_fee_rate: 0.04,
    marketplace_fee_cap_cents: Number.MAX_SAFE_INTEGER,
    stripe_processing_included: false,
  }
  let query = supabaseAdmin.from('platform_subscriptions').select('status, tier, plan_type, processing_fee_rate, trial_end, current_period_start, current_period_end, cancel_at_period_end, billing_interval, renewal_amount_cents, currency, stripe_customer_id, stripe_subscription_id, stripe_price_id, purchase_channel')
    .eq('owner_type', actor.role)
    .eq('owner_id', actor.role === 'org' ? actor.organizationId : actor.userId)
  const { data, error } = await query.maybeSingle()

  if (!error && data) {
    const stripeSubscription = data.stripe_subscription_id
      ? await stripe.subscriptions.retrieve(data.stripe_subscription_id).catch((retrieveError) => {
          console.error('[platformSubscription] Stripe retrieve failed; using canonical snapshot', retrieveError)
          return null
        })
      : null
    const status = normalizePlatformSubscriptionStatus(stripeSubscription?.status || data.status)
    const tier = normalizeTierForBillingRole(actor.billingRole, data.tier)
    const resolvedExpectedBasePrice = resolveFirstConfiguredPrice(getAllAccessPriceKeys(
      actor.role === 'org' ? 'org' : actor.role,
      data.billing_interval === 'year' ? 'year' : 'month',
      actor.role === 'org' && isOrganizationPlanKey(data.tier) ? data.tier : null,
    )).priceId
    const baseItem = stripeSubscription?.items.data.find((item) => item.price.id === resolvedExpectedBasePrice)
      || stripeSubscription?.items.data[0]
    const interval = (baseItem?.price.recurring?.interval || data.billing_interval) === 'year' ? 'year' : 'month'
    const baseAmount = actor.role === 'coach'
      ? ALL_ACCESS_PRICING.coach[interval]
      : actor.role === 'athlete'
        ? ALL_ACCESS_PRICING.athlete[interval]
        : isOrganizationPlanKey(data.tier)
          ? ALL_ACCESS_PRICING.org.plans[data.tier][interval]
          : Number(data.renewal_amount_cents || 0)
    const stripeBaseAmount = Number(baseItem?.price.unit_amount ?? baseAmount)
    const renewalAmount = stripeSubscription?.items.data.reduce(
      (sum, item) => sum + Number(item.price.unit_amount || 0) * Number(item.quantity || 1),
      0,
    ) ?? Number(data.renewal_amount_cents || stripeBaseAmount)
    const stripePeriodEnd = (stripeSubscription as { current_period_end?: number | null } | null)?.current_period_end
    const shared = {
      has_access: Boolean(tier) && platformSubscriptionHasAccess({
        status,
        trialEnd: stripeSubscription?.trial_end ? isoFromUnix(stripeSubscription.trial_end) : data.trial_end,
      }),
      status,
      tier,
      billing_role: actor.mobileBillingRole,
      plan_key: actor.role === 'athlete' ? null : actor.role === 'coach' ? 'individual_coach' : 'organization',
      billing_interval: interval === 'year' ? 'annual' : 'monthly',
      current_period_start: (stripeSubscription as { current_period_start?: number | null } | null)?.current_period_start
        ? isoFromUnix((stripeSubscription as { current_period_start?: number | null }).current_period_start)
        : data.current_period_start || null,
      current_period_end: stripePeriodEnd ? isoFromUnix(stripePeriodEnd) : data.current_period_end || null,
      trial_start: stripeSubscription?.trial_start ? isoFromUnix(stripeSubscription.trial_start) : null,
      trial_end: stripeSubscription?.trial_end ? isoFromUnix(stripeSubscription.trial_end) : data.trial_end || null,
      cancel_at_period_end: stripeSubscription?.cancel_at_period_end ?? Boolean(data.cancel_at_period_end),
      canceled_at: stripeSubscription?.canceled_at ? isoFromUnix(stripeSubscription.canceled_at) : null,
      currency: stripeSubscription?.currency || data.currency || 'usd',
      purchase_channel: (data.purchase_channel as 'stripe' | 'apple_iap' | null)
        || (data.stripe_subscription_id ? 'stripe' : null),
      base_amount: stripeBaseAmount,
      renewal_amount: renewalAmount,
      stripe_customer_id: data.stripe_customer_id || null,
      stripe_subscription_id: data.stripe_subscription_id || null,
      stripe_price_id: baseItem?.price.id || data.stripe_price_id || null,
      fee_breakdown: Object.fromEntries(Object.entries(feeBreakdown).map(([key, value]) =>
        key.endsWith('_fee_rate') ? [key, Number(data.processing_fee_rate ?? 0.04)] : [key, value]
      )) as typeof feeBreakdown,
    }
    if (actor.role === 'athlete') {
      const { count } = await supabaseAdmin.from('family_subscription_athletes')
        .select('id', { count: 'exact', head: true }).eq('subscription_owner_id', actor.userId)
      return { ...shared, family_athlete_limit: 4, covered_athlete_count: count || 0 }
    }
    return shared
  }

  // Migration fallback: preserve only currently-accessible legacy records.
  if (actor.role === 'coach' || actor.role === 'athlete') {
    const [{ data: profile }, { data: plan }] = await Promise.all([
      supabaseAdmin.from('profiles').select('subscription_status, plan_tier').eq('id', actor.userId).maybeSingle(),
      actor.role === 'coach'
        ? supabaseAdmin.from('coach_plans').select('tier').eq('coach_id', actor.userId).maybeSingle()
        : supabaseAdmin.from('athlete_plans').select('tier').eq('athlete_id', actor.userId).maybeSingle(),
    ])
    const status = normalizePlatformSubscriptionStatus(profile?.subscription_status)
    const tier = normalizeTierForBillingRole(actor.billingRole, plan?.tier || profile?.plan_tier)
    const hasAccess = status === 'active' && Boolean(tier)
    return {
      has_access: hasAccess,
      status: hasAccess ? status : 'none',
      tier: hasAccess ? tier : null,
      billing_role: actor.mobileBillingRole,
      plan_key: actor.role === 'coach' ? 'coach_all_access' : 'family_all_access',
      fee_breakdown: feeBreakdown,
    }
  }

  const { data: settings } = await supabaseAdmin.from('org_settings')
    .select('plan_status, plan').eq('org_id', actor.organizationId).maybeSingle()
  const status = normalizePlatformSubscriptionStatus(settings?.plan_status)
  const rawOrgPlan = settings?.plan
  const tier = normalizeTierForBillingRole('org', rawOrgPlan)
  const hasAccess = status === 'active' && Boolean(tier)
  return {
    has_access: hasAccess,
    status: hasAccess ? status : 'none',
    tier: hasAccess ? tier : null,
    billing_role: actor.mobileBillingRole,
    plan_key: isOrganizationPlanKey(rawOrgPlan) ? rawOrgPlan : null,
    fee_breakdown: feeBreakdown,
  }
}
