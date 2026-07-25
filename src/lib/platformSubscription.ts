import { normalizeTierForBillingRole, type BillingRole } from '@/lib/billingState'
import { ORG_ROLE_SET } from '@/lib/sessionRoleState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ALL_ACCESS_PRICING } from '@/lib/allAccessPricing'
import { calculateActiveOrgCoachCount } from '@/lib/orgCoachBilling'
import stripe from '@/lib/stripeServer'
import { getAllAccessPriceKeys, getOrgCoachSeatPriceKeys, resolveFirstConfiguredPrice } from '@/lib/allAccessPricing'
import { getFeeSettings } from '@/lib/orgPlatformFees'

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
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (String(profile?.role || '') === 'coach') {
    return {
      userId, role: 'coach', billingRole: 'coach', mobileBillingRole: 'independent_coach',
      organizationId: null, canViewOrgBilling: false,
    }
  }
  if (['athlete', 'guardian', 'parent'].includes(String(profile?.role || ''))) {
    return {
      userId, role: 'athlete', billingRole: 'athlete', mobileBillingRole: 'family',
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
  cancel_at_period_end?: boolean
  currency?: string
  base_amount?: number
  renewal_amount?: number
  family_athlete_limit?: number
  covered_athlete_count?: number
  active_coach_count?: number
  included_coach_count?: number
  additional_coach_count?: number
  purchase_channel?: 'stripe' | 'apple_iap' | null
  coach_seat_unit_amount?: number
  projected_subscription_total?: number
  fee_breakdown?: {
    standard_session_fee_rate: number
    high_volume_session_fee_rate: number
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
    standard_session_fee_rate: (feeSettings.orgSessionRollingVolumeTiers[0]?.feePercent
      ?? ALL_ACCESS_PRICING.fees.sessionPercent) / 100,
    high_volume_session_fee_rate: (feeSettings.orgSessionRollingVolumeTiers.at(-1)?.feePercent
      ?? ALL_ACCESS_PRICING.fees.highVolumeSessionPercent) / 100,
    marketplace_fee_rate: feeSettings.marketplacePlatformFeePercent / 100,
    marketplace_fee_cap_cents: feeSettings.marketplacePlatformFeeCapCents,
    stripe_processing_included: true,
  }
  let query = supabaseAdmin.from('platform_subscriptions').select('status, tier, trial_end, current_period_end, cancel_at_period_end, billing_interval, renewal_amount_cents, currency, stripe_subscription_id, stripe_coach_seat_item_id, purchase_channel')
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
    const expectedBasePrice = resolveFirstConfiguredPrice(
      getAllAccessPriceKeys(actor.role === 'org' ? 'org' : actor.role, data.billing_interval === 'year' ? 'year' : 'month'),
    ).priceId
    const baseItem = stripeSubscription?.items.data.find((item) => item.price.id === expectedBasePrice)
      || stripeSubscription?.items.data.find((item) => item.id !== data.stripe_coach_seat_item_id)
    const interval = (baseItem?.price.recurring?.interval || data.billing_interval) === 'year' ? 'year' : 'month'
    const baseAmount = actor.role === 'coach'
      ? ALL_ACCESS_PRICING.coach[interval]
      : actor.role === 'athlete'
        ? ALL_ACCESS_PRICING.athlete[interval]
        : ALL_ACCESS_PRICING.org[interval]
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
      plan_key: actor.role === 'athlete'
        ? 'family_all_access'
        : actor.role === 'coach' ? 'coach_all_access' : 'org_all_access',
      billing_interval: interval === 'year' ? 'annual' : 'monthly',
      current_period_end: stripePeriodEnd ? isoFromUnix(stripePeriodEnd) : data.current_period_end || null,
      cancel_at_period_end: stripeSubscription?.cancel_at_period_end ?? Boolean(data.cancel_at_period_end),
      currency: stripeSubscription?.currency || data.currency || 'usd',
      purchase_channel: (data.purchase_channel as 'stripe' | 'apple_iap' | null) || null,
      base_amount: stripeBaseAmount,
      renewal_amount: renewalAmount,
      fee_breakdown: feeBreakdown,
    }
    if (actor.role === 'athlete') {
      const { count } = await supabaseAdmin.from('family_subscription_athletes')
        .select('id', { count: 'exact', head: true }).eq('subscription_owner_id', actor.userId)
      return { ...shared, family_athlete_limit: 4, covered_athlete_count: count || 0 }
    }
    if (actor.role === 'org' && actor.organizationId && actor.canViewOrgBilling) {
      const seats = await calculateActiveOrgCoachCount(actor.organizationId)
      const expectedSeatPrice = resolveFirstConfiguredPrice(getOrgCoachSeatPriceKeys(interval)).priceId
      const seatItem = stripeSubscription?.items.data.find((item) =>
        item.id === data.stripe_coach_seat_item_id || item.price.id === expectedSeatPrice)
      const seatAmount = Number(seatItem?.price.unit_amount ?? ALL_ACCESS_PRICING.org.additionalCoach[interval])
      const stripeAdditionalQuantity = Number(seatItem?.quantity ?? seats.additionalCoachCount)
      return {
        ...shared,
        active_coach_count: seats.activeCoachCount,
        included_coach_count: ALL_ACCESS_PRICING.org.includedCoaches,
        additional_coach_count: stripeAdditionalQuantity,
        coach_seat_unit_amount: seatAmount,
        projected_subscription_total: stripeBaseAmount + stripeAdditionalQuantity * seatAmount,
      }
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
  const tier = normalizeTierForBillingRole('org', settings?.plan)
  const hasAccess = status === 'active' && Boolean(tier)
  return {
    has_access: hasAccess,
    status: hasAccess ? status : 'none',
    tier: hasAccess ? tier : null,
    billing_role: actor.mobileBillingRole,
    plan_key: 'org_all_access',
    fee_breakdown: feeBreakdown,
  }
}
