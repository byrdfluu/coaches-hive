import type { OrgTier } from '@/lib/planRules'

export const ORG_BASE_FEE_RANGE = '$499'
/** @deprecated Use ORG_SESSION_FEES[tier] for tier-aware fee calculation. */
export const ORG_TRANSACTION_FEE = 8
export const ORG_MARKETPLACE_FEE = 10

export const ORG_SESSION_FEES: Record<OrgTier, number> = {
  standard: 8,
  growth: 6,
  enterprise: 4,
}

export const ORG_PLAN_PRICING = {
  standard: '$499',
  growth: '$899',
  enterprise: '$1,599',
} as const

export const SCHOOL_PLAN_PRICING = {
  starter: '$699',
  program: '$1,299',
  district: '$2,499',
} as const

/** Schools get $0 session booking fees — subscription covers platform cost. */
export const SCHOOL_MARKETPLACE_FEE = 5

/** Schools sponsor all athlete sessions — no athlete payment required at booking. */
export const isSchoolOrg = (orgType: string | null | undefined): boolean =>
  orgType === 'school'
