import { COACH_MARKETPLACE_FEES, COACH_SESSION_FEES } from '@/lib/coachPricing'

export type FeeTier = 'starter' | 'pro' | 'elite'
export type FeeCategory = 'session' | 'marketplace_digital' | 'marketplace_physical'

export const DEFAULT_FEE_RULES: Record<FeeTier, Record<FeeCategory, number>> = {
  starter: {
    session: COACH_SESSION_FEES.starter,
    marketplace_digital: COACH_MARKETPLACE_FEES.starter,
    marketplace_physical: COACH_MARKETPLACE_FEES.starter,
  },
  pro: {
    session: COACH_SESSION_FEES.pro,
    marketplace_digital: COACH_MARKETPLACE_FEES.pro,
    marketplace_physical: COACH_MARKETPLACE_FEES.pro,
  },
  elite: {
    session: COACH_SESSION_FEES.elite,
    marketplace_digital: COACH_MARKETPLACE_FEES.elite,
    marketplace_physical: COACH_MARKETPLACE_FEES.elite,
  },
}

const LEGACY_DEFAULT_FEE_RULES: Record<FeeTier, Record<FeeCategory, number>> = {
  starter: {
    session: 16,
    marketplace_digital: 10,
    marketplace_physical: 10,
  },
  pro: {
    session: 13,
    marketplace_digital: 10,
    marketplace_physical: 10,
  },
  elite: {
    session: 10,
    marketplace_digital: 10,
    marketplace_physical: 10,
  },
}

const FEE_TIERS: FeeTier[] = ['starter', 'pro', 'elite']
const FEE_CATEGORIES: FeeCategory[] = ['session', 'marketplace_digital', 'marketplace_physical']

const isLegacySeedRuleSet = (rules: Array<{ tier: string; category: string; percentage: number }>) => {
  if (rules.length !== FEE_TIERS.length * FEE_CATEGORIES.length) return false

  return FEE_TIERS.every((tier) =>
    FEE_CATEGORIES.every((category) => {
      const rule = rules.find((candidate) => candidate.tier === tier && candidate.category === category)
      return Number(rule?.percentage ?? NaN) === LEGACY_DEFAULT_FEE_RULES[tier][category]
    }),
  )
}

export const getFeePercentage = (
  tier: FeeTier,
  category: FeeCategory,
  rules: Array<{ tier: string; category: string; percentage: number }> = []
) => {
  if (isLegacySeedRuleSet(rules)) {
    return DEFAULT_FEE_RULES[tier]?.[category] ?? 0
  }
  const match = rules.find((rule) => rule.tier === tier && rule.category === category)
  if (match) return match.percentage
  return DEFAULT_FEE_RULES[tier]?.[category] ?? 0
}

export const resolveProductCategory = (productType?: string | null): FeeCategory => {
  const type = (productType || '').toLowerCase()
  if (type.includes('physical')) return 'marketplace_physical'
  return 'marketplace_digital'
}
