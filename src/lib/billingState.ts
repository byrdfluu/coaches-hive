import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ORG_BILLING_ROLE_SET = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

export type BillingRole = 'coach' | 'athlete' | 'org'

export type BillingInfoSnapshot = {
  status: string | null
  tier: string | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
}

export const resolveBillingRole = (role?: string | null): BillingRole | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role && ORG_BILLING_ROLE_SET.has(role)) return 'org'
  return null
}

export const isBillingAccessActive = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase()
  return normalized === 'active' || normalized === 'trialing' || normalized === 'past_due'
}

export const normalizeTierForBillingRole = (billingRole: BillingRole, tier?: string | null) => {
  const normalizedTier = String(tier || '').trim().toLowerCase()
  if (!normalizedTier) return null

  if (billingRole === 'coach') {
    if (normalizedTier === 'starter' || normalizedTier === 'pro' || normalizedTier === 'elite') {
      return normalizeCoachTier(normalizedTier)
    }
    return null
  }

  if (billingRole === 'athlete') {
    if (normalizedTier === 'explore' || normalizedTier === 'train' || normalizedTier === 'family') {
      return normalizeAthleteTier(normalizedTier)
    }
    return null
  }

  if (normalizedTier === 'standard' || normalizedTier === 'growth' || normalizedTier === 'enterprise') {
    return normalizeOrgTier(normalizedTier)
  }
  return null
}

export const getOrgIdForUser = async (userId: string, currentOrgIdHint?: string | null) => {
  if (currentOrgIdHint) {
    const { data: hintedMembership, error: hintedError } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', currentOrgIdHint)
      .limit(1)
      .maybeSingle()

    if (hintedError) throw new Error(hintedError.message)
    if (hintedMembership?.org_id) return hintedMembership.org_id
  }

  const { data, error } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.org_id || null
}

export const getStripeCustomerIdForUser = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return String(data?.stripe_customer_id || '').trim() || null
}

export const resolveDbBillingInfoForActor = async ({
  userId,
  billingRole,
  selectedTierHint,
  orgIdHint,
}: {
  userId: string
  billingRole: BillingRole
  selectedTierHint?: string | null
  orgIdHint?: string | null
}): Promise<BillingInfoSnapshot> => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .maybeSingle()

  if (billingRole === 'coach') {
    const { data: coachPlan } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', userId)
      .maybeSingle()
    return {
      status: String(profile?.subscription_status || '').trim() || null,
      tier:
        normalizeTierForBillingRole(billingRole, coachPlan?.tier)
        || normalizeTierForBillingRole(billingRole, selectedTierHint),
      current_period_end: null,
      trial_end: null,
      cancel_at_period_end: false,
    }
  }

  if (billingRole === 'athlete') {
    const { data: athletePlan } = await supabaseAdmin
      .from('athlete_plans')
      .select('tier')
      .eq('athlete_id', userId)
      .maybeSingle()
    return {
      status: String(profile?.subscription_status || '').trim() || null,
      tier:
        normalizeTierForBillingRole(billingRole, athletePlan?.tier)
        || normalizeTierForBillingRole(billingRole, selectedTierHint),
      current_period_end: null,
      trial_end: null,
      cancel_at_period_end: false,
    }
  }

  const orgId = await getOrgIdForUser(userId, orgIdHint)
  if (!orgId) {
    return {
      status: null,
      tier: null,
      current_period_end: null,
      trial_end: null,
      cancel_at_period_end: false,
    }
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', orgId)
    .maybeSingle()

  return {
    status: String(orgSettings?.plan_status || '').trim() || null,
    tier:
      normalizeTierForBillingRole(billingRole, orgSettings?.plan)
      || normalizeTierForBillingRole(billingRole, selectedTierHint),
    current_period_end: null,
    trial_end: null,
    cancel_at_period_end: false,
  }
}
