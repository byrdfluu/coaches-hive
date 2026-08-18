import { getAllAccessPriceKeys, isOrganizationPlanKey, normalizeBillingInterval } from '@/lib/allAccessPricing'

export const MOBILE_ORG_ROLES = new Set([
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
])

const SCHOOL_ROLES = new Set(['school_admin', 'athletic_director', 'program_director'])

export const resolveMobileOnboardingPlan = (role: string, _requestedTier: string, requestedInterval?: string) => {
  const billingInterval = normalizeBillingInterval(requestedInterval)
  if (role === 'athlete') {
    return null
  }
  if (role === 'coach') {
    return { billingRole: 'coach' as const, tier: 'individual_coach', billingInterval, priceKeys: getAllAccessPriceKeys('coach', billingInterval), trialDays: 7 }
  }
  if (MOBILE_ORG_ROLES.has(role)) {
    return { billingRole: 'org' as const, tier: 'organization', billingInterval, priceKeys: getAllAccessPriceKeys('org', billingInterval, 'organization'), trialDays: 14 }
  }
  return null
}

export const resolveConfiguredPriceId = (keys: string[]) =>
  keys.map((key) => process.env[key]).find(Boolean) || null
