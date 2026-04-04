import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'

export type StripeBillingRole = 'coach' | 'athlete' | 'org'

const buildPriceToTierMap = (): Map<string, { role: StripeBillingRole; tier: string }> => {
  const map = new Map<string, { role: StripeBillingRole; tier: string }>()
  const entries: Array<[string | undefined, StripeBillingRole, string]> = [
    [process.env.STRIPE_PRICE_COACH_STARTER_MONTHLY, 'coach', 'starter'],
    [process.env.STRIPE_PRICE_COACH_BASIC_MONTHLY, 'coach', 'starter'],
    [process.env.STRIPE_PRICE_COACH_PRO_MONTHLY, 'coach', 'pro'],
    [process.env.STRIPE_PRICE_COACH_ELITE_MONTHLY, 'coach', 'elite'],
    [process.env.STRIPE_PRICE_ATHLETE_EXPLORE_MONTHLY, 'athlete', 'explore'],
    [process.env.STRIPE_PRICE_ATHLETE_BASIC_MONTHLY, 'athlete', 'explore'],
    [process.env.STRIPE_PRICE_ATHLETE_TRAIN_MONTHLY, 'athlete', 'train'],
    [process.env.STRIPE_PRICE_ATHLETE_PRO_MONTHLY, 'athlete', 'train'],
    [process.env.STRIPE_PRICE_ATHLETE_FAMILY_MONTHLY, 'athlete', 'family'],
    [process.env.STRIPE_PRICE_ATHLETE_ELITE_MONTHLY, 'athlete', 'family'],
    [process.env.STRIPE_PRICE_ORG_STANDARD_MONTHLY, 'org', 'standard'],
    [process.env.STRIPE_PRICE_ORG_BASIC_MONTHLY, 'org', 'standard'],
    [process.env.STRIPE_PRICE_ORG_GROWTH_MONTHLY, 'org', 'growth'],
    [process.env.STRIPE_PRICE_ORG_PRO_MONTHLY, 'org', 'growth'],
    [process.env.STRIPE_PRICE_ORG_ENTERPRISE_MONTHLY, 'org', 'enterprise'],
    [process.env.STRIPE_PRICE_ORG_ELITE_MONTHLY, 'org', 'enterprise'],
  ]

  for (const [priceId, role, tier] of entries) {
    if (priceId) map.set(priceId, { role, tier })
  }

  return map
}

const PRICE_TO_TIER = buildPriceToTierMap()

export const resolveStripePriceTier = (priceId?: string | null) => {
  if (!priceId) return null
  return PRICE_TO_TIER.get(priceId) || null
}

export const resolveTierForBillingRoleFromPriceId = (
  billingRole: StripeBillingRole,
  priceId?: string | null,
) => {
  const resolved = resolveStripePriceTier(priceId)
  if (!resolved || resolved.role !== billingRole) return null

  if (billingRole === 'coach') return normalizeCoachTier(resolved.tier)
  if (billingRole === 'athlete') return normalizeAthleteTier(resolved.tier)
  return normalizeOrgTier(resolved.tier)
}
