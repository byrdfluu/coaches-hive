export type BillingInterval = 'month' | 'year'

export const ALL_ACCESS_PRICING = {
  athlete: {
    month: 499,
    year: 4900,
    familyAthleteLimit: 4,
  },
  coach: {
    month: 4900,
    year: 49000,
  },
  org: {
    month: 4900,
    year: 49000,
    includedCoaches: 1,
    additionalCoach: {
      month: 2000,
      year: 20000,
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
) => {
  const suffix = interval === 'year' ? 'ANNUAL' : 'MONTHLY'
  if (role === 'coach') return [`STRIPE_PRICE_COACH_ALL_ACCESS_${suffix}`]
  if (role === 'athlete') return [`STRIPE_PRICE_FAMILY_ALL_ACCESS_${suffix}`]
  return [`STRIPE_PRICE_ORG_ALL_ACCESS_${suffix}`]
}

export const getOrgCoachSeatPriceKeys = (interval: BillingInterval) => [
  `STRIPE_PRICE_ORG_COACH_SEAT_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'}`,
]

export const resolveFirstConfiguredPrice = (keys: string[]) => ({
  priceId: keys.map((key) => process.env[key]).find(Boolean) || null,
  keysTried: keys,
})
