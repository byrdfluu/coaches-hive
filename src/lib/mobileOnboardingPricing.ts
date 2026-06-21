import { normalizeCoachTier, normalizeOrgTier, normalizeSchoolTier } from '@/lib/planRules'

export const MOBILE_ORG_ROLES = new Set([
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
])

const SCHOOL_ROLES = new Set(['school_admin', 'athletic_director', 'program_director'])

export const resolveMobileOnboardingPlan = (role: string, requestedTier: string) => {
  if (role === 'coach') {
    const tier = normalizeCoachTier(requestedTier)
    const keys: Record<string, string[]> = {
      starter: ['STRIPE_PRICE_COACH_STARTER_MONTHLY', 'STRIPE_PRICE_COACH_BASIC_MONTHLY'],
      pro: ['STRIPE_PRICE_COACH_PRO_MONTHLY'],
      elite: ['STRIPE_PRICE_COACH_ELITE_MONTHLY'],
    }
    return { billingRole: 'coach' as const, tier, priceKeys: keys[tier] || [], trialDays: 7 }
  }
  if (MOBILE_ORG_ROLES.has(role)) {
    const school = SCHOOL_ROLES.has(role)
    const tier = school ? normalizeSchoolTier(requestedTier) : normalizeOrgTier(requestedTier)
    const keys: Record<string, string[]> = school
      ? {
          starter: ['STRIPE_PRICE_SCHOOL_STARTER_MONTHLY'],
          program: ['STRIPE_PRICE_SCHOOL_PROGRAM_MONTHLY'],
          district: ['STRIPE_PRICE_SCHOOL_DISTRICT_MONTHLY'],
        }
      : {
          standard: ['STRIPE_PRICE_ORG_STANDARD_MONTHLY', 'STRIPE_PRICE_ORG_BASIC_MONTHLY'],
          growth: ['STRIPE_PRICE_ORG_GROWTH_MONTHLY', 'STRIPE_PRICE_ORG_PRO_MONTHLY'],
          enterprise: ['STRIPE_PRICE_ORG_ENTERPRISE_MONTHLY', 'STRIPE_PRICE_ORG_ELITE_MONTHLY'],
        }
    return { billingRole: 'org' as const, tier, priceKeys: keys[tier] || [], trialDays: 14 }
  }
  return null
}

export const resolveConfiguredPriceId = (keys: string[]) =>
  keys.map((key) => process.env[key]).find(Boolean) || null

