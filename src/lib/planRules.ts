export type CoachTier = 'starter' | 'pro' | 'elite'
export type AthleteTier = 'explore' | 'train' | 'family'
export type OrgTier = 'standard' | 'growth' | 'enterprise'
export type SchoolTier = 'starter' | 'program' | 'district'
export type OrgPlanStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export const COACH_ATHLETE_LIMITS: Record<CoachTier, number | null> = {
  starter: 3,
  pro: 50,
  elite: null,
}

export const COACH_MARKETPLACE_ALLOWED: Record<CoachTier, boolean> = {
  starter: false,
  pro: true,
  elite: true,
}

export const COACH_TEAM_PLANS_ALLOWED: Record<CoachTier, boolean> = {
  starter: false,
  pro: false,
  elite: true,
}

export const COACH_AVAILABILITY_RULES_ALLOWED: Record<CoachTier, boolean> = {
  starter: false,
  pro: true,
  elite: true,
}

export const ATHLETE_PROFILE_LIMITS: Record<AthleteTier, number | null> = {
  explore: 1,
  train: 2,
  family: null,
}

export const ATHLETE_FAMILY_FEATURES: Record<AthleteTier, boolean> = {
  explore: false,
  train: true,
  family: true,
}

export const ATHLETE_PAYMENTS_ALLOWED: Record<AthleteTier, boolean> = {
  explore: false,
  train: true,
  family: true,
}

export const ORG_FEATURES: Record<
  OrgTier,
  {
    feeCreation: boolean
    teamCreation: boolean
    marketplacePublishing: boolean
    marketplaceAdvanced: boolean
    manualReminders: boolean
    feeReminders: boolean
    exportReports: boolean
    complianceTools: boolean
    roleAssignments: boolean
  }
> = {
  standard: {
    feeCreation: true,
    teamCreation: true,
    marketplacePublishing: false,
    marketplaceAdvanced: false,
    manualReminders: false,
    feeReminders: false,
    exportReports: false,
    complianceTools: false,
    roleAssignments: false,
  },
  growth: {
    feeCreation: true,
    teamCreation: true,
    marketplacePublishing: true,
    marketplaceAdvanced: false,
    manualReminders: true,
    feeReminders: true,
    exportReports: true,
    complianceTools: true,
    roleAssignments: true,
  },
  enterprise: {
    feeCreation: true,
    teamCreation: true,
    marketplacePublishing: true,
    marketplaceAdvanced: true,
    manualReminders: true,
    feeReminders: true,
    exportReports: true,
    complianceTools: true,
    roleAssignments: true,
  },
}

export const ORG_MARKETPLACE_LIMITS: Record<OrgTier, number | null> = {
  standard: 0,
  growth: 20,
  enterprise: null,
}

export const ORG_COACH_LIMITS: Record<OrgTier, number | null> = {
  standard: 5,
  growth: 20,
  enterprise: null,
}

export const ORG_ATHLETE_LIMITS: Record<OrgTier, number | null> = {
  standard: 50,
  growth: 250,
  enterprise: null,
}

export const normalizeCoachTier = (tier?: string | null): CoachTier => {
  const normalized = String(tier || '').toLowerCase()
  if (normalized === 'pro' || normalized === 'elite') {
    return normalized
  }
  return 'starter'
}

export const normalizeAthleteTier = (tier?: string | null): AthleteTier => {
  const normalized = String(tier || '').toLowerCase()
  if (normalized === 'train' || normalized === 'family') {
    return normalized
  }
  return 'explore'
}

export const normalizeOrgTier = (tier?: string | null): OrgTier => {
  const normalized = String(tier || '').toLowerCase()
  if (normalized === 'growth' || normalized === 'enterprise') {
    return normalized
  }
  return 'standard'
}

export const normalizeSchoolTier = (tier?: string | null): SchoolTier => {
  const normalized = String(tier || '').toLowerCase()
  if (normalized === 'program' || normalized === 'district') {
    return normalized
  }
  return 'starter'
}

/** Map a school tier to the equivalent org feature tier for gate checks. */
export const schoolTierToOrgTier = (tier: SchoolTier): OrgTier => {
  if (tier === 'program') return 'growth'
  if (tier === 'district') return 'enterprise'
  return 'standard'
}

export const normalizeOrgStatus = (status?: string | null): OrgPlanStatus => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active' || normalized === 'past_due' || normalized === 'canceled') {
    return normalized as OrgPlanStatus
  }
  return 'trialing'
}

export const isOrgPlanActive = (status?: string | null) => {
  const s = normalizeOrgStatus(status)
  return s === 'active' || s === 'trialing'
}

export const formatTierName = (tier: string) =>
  tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : tier
