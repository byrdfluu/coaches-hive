export type BillingInterval = 'month' | 'year'
export type PlanKey = 'team_starter' | 'growing_organization' | 'established_organization' | 'league_enterprise'
export type SelfServicePlanKey = Exclude<PlanKey, 'league_enterprise'>
export type OrganizationPlanKey = PlanKey | 'organization' | 'org_starter' | 'org_growth'

export type PlanDefinition = {
  key: PlanKey
  role: 'coach' | 'org'
  monthlyCents: number
  annualCents: number
  trialDays: 7 | 14
  maxActiveTeams: number | null
  maxStaff: number | null
  selfService: boolean
}

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  team_starter: { key: 'team_starter', role: 'coach', monthlyCents: 4900, annualCents: 49000, trialDays: 7, maxActiveTeams: 1, maxStaff: 3, selfService: true },
  growing_organization: { key: 'growing_organization', role: 'org', monthlyCents: 12900, annualCents: 129000, trialDays: 14, maxActiveTeams: 6, maxStaff: 15, selfService: true },
  established_organization: { key: 'established_organization', role: 'org', monthlyCents: 24900, annualCents: 249000, trialDays: 14, maxActiveTeams: 15, maxStaff: 35, selfService: true },
  league_enterprise: { key: 'league_enterprise', role: 'org', monthlyCents: 49900, annualCents: 499000, trialDays: 14, maxActiveTeams: null, maxStaff: null, selfService: false },
}

export const normalizePlanKey = (value: unknown, role?: 'coach' | 'org' | null): PlanKey | null => {
  const key = String(value || '').trim().toLowerCase()
  if (key in PLAN_CATALOG) return key as PlanKey
  if (key === 'coach_all_access' || key === 'individual_coach') return 'team_starter'
  if (key === 'org_starter') return 'growing_organization'
  if (key === 'org_growth' || key === 'org_all_access' || key === 'organization') return 'established_organization'
  if (key === 'standard') return role === 'coach' ? 'team_starter' : 'growing_organization'
  if (key === 'growth') return 'growing_organization'
  if (key === 'enterprise' || key === 'all_access') return 'established_organization'
  return null
}

export const getPlan = (value: unknown, role?: 'coach' | 'org' | null) => {
  const key = normalizePlanKey(value, role)
  return key ? PLAN_CATALOG[key] : null
}

export const getPlanPriceCents = (plan: PlanDefinition, interval: BillingInterval) => interval === 'year' ? plan.annualCents : plan.monthlyCents

export const ALL_ACCESS_PRICING = {
  athlete: { month: 0, year: 0, familyAthleteLimit: Number.MAX_SAFE_INTEGER },
  coach: { month: 4900, year: 49000 },
  org: {
    month: 24900, year: 249000,
    plans: {
      team_starter: { month: 4900, year: 49000 },
      growing_organization: { month: 12900, year: 129000 },
      established_organization: { month: 24900, year: 249000 },
      league_enterprise: { month: 49900, year: 499000 },
      organization: { month: 24900, year: 249000 },
      org_starter: { month: 12900, year: 129000 },
      org_growth: { month: 24900, year: 249000 },
    },
  },
  fees: { platformPercent: 4, sessionPercent: 4, highVolumeSessionPercent: 4, highVolumeThresholdCents: Number.MAX_SAFE_INTEGER, marketplacePercent: 4, marketplaceCapCents: Number.MAX_SAFE_INTEGER },
} as const

export const normalizeBillingInterval = (value?: string | null): BillingInterval => String(value || '').toLowerCase() === 'year' || String(value || '').toLowerCase() === 'annual' ? 'year' : 'month'
export const formatUsdCents = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)

export const getAllAccessPriceKeys = (role: 'coach' | 'athlete' | 'org', interval: BillingInterval, requestedPlan?: OrganizationPlanKey | null) => {
  if (role === 'athlete') return []
  const plan = role === 'coach' ? PLAN_CATALOG.team_starter : getPlan(requestedPlan, 'org')
  if (!plan || !plan.selfService || plan.role !== role) return []
  const suffix = interval === 'year' ? 'ANNUAL' : 'MONTHLY'
  const prefix: Record<SelfServicePlanKey, string> = {
    team_starter: 'TEAM_STARTER',
    growing_organization: 'GROWING_ORGANIZATION',
    established_organization: 'ESTABLISHED_ORGANIZATION',
  }
  return [`STRIPE_PRICE_${prefix[plan.key as SelfServicePlanKey]}_${suffix}`]
}

export const isOrganizationPlanKey = (value: unknown): value is OrganizationPlanKey => Boolean(normalizePlanKey(value, 'org'))
export const resolveFirstConfiguredPrice = (keys: string[]) => ({ priceId: keys.map((key) => process.env[key]).find(Boolean) || null, keysTried: keys })
