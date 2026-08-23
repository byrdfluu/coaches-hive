export type BillingInterval = 'month' | 'year'
export type OrganizationPlanKey = 'organization' | 'org_starter' | 'org_growth'

export const ALL_ACCESS_PRICING = {
  /** Legacy read-only family pricing retained for historical subscription displays. */
  athlete: { month: 499, year: 4900, familyAthleteLimit: 4 },
  coach: {
    month: 9900,
    year: 99000,
  },
  org: {
    month: 49900,
    year: 499000,
    plans: {
      organization: { month: 49900, year: 499000 },
      org_starter: { month: 49900, year: 499000 },
      org_growth: { month: 49900, year: 499000 },
    },
  },
  fees: {
    platformPercent: 4,
    sessionPercent: 4,
    highVolumeSessionPercent: 4,
    highVolumeThresholdCents: Number.MAX_SAFE_INTEGER,
    marketplacePercent: 4,
    marketplaceCapCents: Number.MAX_SAFE_INTEGER,
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
  if (role === 'athlete') return []
  if (organizationPlanKey === 'organization' || organizationPlanKey === 'org_starter' || organizationPlanKey === 'org_growth') {
    return [`STRIPE_PRICE_ORG_ALL_ACCESS_${suffix}`]
  }
  return []
}

export const isOrganizationPlanKey = (value: unknown): value is OrganizationPlanKey =>
  value === 'organization' || value === 'org_starter' || value === 'org_growth'

export const resolveFirstConfiguredPrice = (keys: string[]) => ({
  priceId: keys.map((key) => process.env[key]).find(Boolean) || null,
  keysTried: keys,
})
