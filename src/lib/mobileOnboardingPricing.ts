import { getAllAccessPriceKeys, getPlan, normalizeBillingInterval } from '@/lib/allAccessPricing'

export const MOBILE_ORG_ROLES = new Set([
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
])

const SCHOOL_ROLES = new Set(['school_admin', 'athletic_director', 'program_director'])

export const resolveMobileOnboardingPlan = (role: string, requestedTier: string, requestedInterval?: string) => {
  const billingInterval = normalizeBillingInterval(requestedInterval)
  if (role === 'athlete') {
    return null
  }
  if (role === 'coach') {
    const plan = getPlan(requestedTier || 'team_starter', 'coach')
    if (!plan || plan.role !== 'coach' || !plan.selfService) return null
    return { billingRole: 'coach' as const, tier: plan.key, billingInterval, priceKeys: getAllAccessPriceKeys('coach', billingInterval), trialDays: plan.trialDays }
  }
  if (MOBILE_ORG_ROLES.has(role)) {
    const plan = getPlan(requestedTier, 'org')
    if (!plan || plan.role !== 'org' || !plan.selfService) return null
    return { billingRole: 'org' as const, tier: plan.key, billingInterval, priceKeys: getAllAccessPriceKeys('org', billingInterval, plan.key), trialDays: plan.trialDays }
  }
  return null
}

export const resolveConfiguredPriceId = (keys: string[]) =>
  keys.map((key) => process.env[key]).find(Boolean) || null
