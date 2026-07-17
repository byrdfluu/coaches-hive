import { normalizeTierForBillingRole, type BillingRole } from '@/lib/billingState'
import { ORG_ROLE_SET } from '@/lib/sessionRoleState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
  role: 'coach' | 'org'
  billingRole: Exclude<BillingRole, 'athlete'>
  organizationId: string | null
}

export const resolvePlatformActor = async (userId: string): Promise<PlatformActor | null> => {
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (String(profile?.role || '') === 'coach') {
    return { userId, role: 'coach', billingRole: 'coach', organizationId: null }
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role, status')
    .eq('user_id', userId)
    .in('role', Array.from(ORG_ROLE_SET))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!membership?.org_id || (membership.status && String(membership.status).toLowerCase() !== 'active')) return null
  return { userId, role: 'org', billingRole: 'org', organizationId: membership.org_id }
}

export type PlatformSubscriptionSnapshot = {
  has_access: boolean
  status: string
  tier: string | null
}

export const getPlatformSubscriptionSnapshot = async (actor: PlatformActor): Promise<PlatformSubscriptionSnapshot> => {
  let query = supabaseAdmin.from('platform_subscriptions').select('status, tier, trial_end')
    .eq('owner_type', actor.role)
    .eq('owner_id', actor.role === 'org' ? actor.organizationId : actor.userId)
  const { data, error } = await query.maybeSingle()

  if (!error && data) {
    const status = normalizePlatformSubscriptionStatus(data.status)
    const tier = normalizeTierForBillingRole(actor.billingRole, data.tier)
    return {
      has_access: Boolean(tier) && platformSubscriptionHasAccess({ status, trialEnd: data.trial_end }),
      status,
      tier,
    }
  }

  // Migration fallback: preserve only currently-accessible legacy records.
  if (actor.role === 'coach') {
    const [{ data: profile }, { data: plan }] = await Promise.all([
      supabaseAdmin.from('profiles').select('subscription_status, plan_tier').eq('id', actor.userId).maybeSingle(),
      supabaseAdmin.from('coach_plans').select('tier').eq('coach_id', actor.userId).maybeSingle(),
    ])
    const status = normalizePlatformSubscriptionStatus(profile?.subscription_status)
    const tier = normalizeTierForBillingRole('coach', plan?.tier || profile?.plan_tier)
    const hasAccess = status === 'active' && Boolean(tier)
    return { has_access: hasAccess, status: hasAccess ? status : status || 'inactive', tier: hasAccess ? tier : null }
  }

  const { data: settings } = await supabaseAdmin.from('org_settings')
    .select('plan_status, plan').eq('org_id', actor.organizationId).maybeSingle()
  const status = normalizePlatformSubscriptionStatus(settings?.plan_status)
  const tier = normalizeTierForBillingRole('org', settings?.plan)
  const hasAccess = status === 'active' && Boolean(tier)
  return { has_access: hasAccess, status: hasAccess ? status : status || 'inactive', tier: hasAccess ? tier : null }
}
