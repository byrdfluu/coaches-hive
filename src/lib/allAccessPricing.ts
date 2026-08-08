export type BillingInterval = 'month' | 'year'
export type OrganizationPlanKey = 'org_starter' | 'org_growth'

export const ALL_ACCESS_PRICING = {
  athlete: {
    month: 499,
    year: 4900,
    familyAthleteLimit: 4,
  },
  coach: {
    month: 9900,
    year: 99000,
  },
  org: {
    plans: {
      org_starter: { month: 39900, year: 399000 },
      org_growth: { month: 99900, year: 999000 },
    },
  },
  fees: {
    sessionPercent: 7,
    highVolumeSessionPercent: 5,
    highVolumeThresholdCents: 2_500_000,
    marketplacePercent: 10,
    marketplaceCapCents: 7500,
  },
} as const

export const normalizeBillingInterval = (value?: string | null): BillingInterval =>
  String(value || '').toLowerCase() === 'year' ? 'year' : 'month'

export const formatUsdCents = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)

export const getAllAccessPriceKeys = (
  role: 'coach' | 'athlete' | 'org',
  interval: BillingInterval,
  organizationPlanKey?: OrganizationPlanKey | null,
) => {
  const suffix = interval === 'year' ? 'ANNUAL' : 'MONTHLY'
  if (role === 'coach') return [`STRIPE_PRICE_COACH_ALL_ACCESS_${suffix}`]
  if (role === 'athlete') return [`STRIPE_PRICE_FAMILY_ALL_ACCESS_${suffix}`]
  if (organizationPlanKey === 'org_starter') return [`STRIPE_PRICE_ORG_STARTER_${suffix}`]
  if (organizationPlanKey === 'org_growth') return [`STRIPE_PRICE_ORG_GROWTH_${suffix}`]
  return []
}

export const isOrganizationPlanKey = (value: unknown): value is OrganizationPlanKey =>
  value === 'org_starter' || value === 'org_growth'

export const resolveFirstConfiguredPrice = (keys: string[]) => ({
  priceId: keys.map((key) => process.env[key]).find(Boolean) || null,
  keysTried: keys,
})
