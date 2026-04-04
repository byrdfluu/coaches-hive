import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
import { roleToPath } from '@/lib/roleRedirect'
import {
  type BillingInfoSnapshot,
  isBillingAccessActive,
  resolveBillingRole,
  resolveDbBillingInfoForActor,
} from '@/lib/billingState'
import { resolveBillingInfoForActor } from '@/lib/subscriptionLifecycle'

export type LifecycleState =
  | 'awaiting_verification'
  | 'verified_pending_plan'
  | 'plan_selected'
  | 'checkout_in_progress'
  | 'active'
  | 'suspended'

export type LifecycleEvent =
  | 'signup_submitted'
  | 'verification_confirmed'
  | 'plan_selected'
  | 'checkout_started'
  | 'checkout_completed'
  | 'account_suspended'
  | 'account_unsuspended'

export type LifecycleSnapshot = {
  role: string
  state: LifecycleState
  selectedTier: string | null
  activeTier: string | null
  nextPath: string
  emailConfirmed: boolean
  suspended: boolean
}

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const asString = (value: unknown, fallback = '') => {
  if (typeof value !== 'string') return fallback
  return value.trim() || fallback
}

export const normalizeLifecycleState = (value: unknown): LifecycleState => {
  const normalized = asString(value)
  if (normalized === 'awaiting_verification') return normalized
  if (normalized === 'verified_pending_plan') return normalized
  if (normalized === 'plan_selected') return normalized
  if (normalized === 'checkout_in_progress') return normalized
  if (normalized === 'active') return normalized
  if (normalized === 'suspended') return normalized
  return 'verified_pending_plan'
}

export const resolveLifecycleStateForSession = ({
  lifecycleStateHint,
  emailConfirmed,
}: {
  lifecycleStateHint?: string | null
  emailConfirmed: boolean
}): LifecycleState => {
  const hintedState = normalizeLifecycleState(lifecycleStateHint)
  if (hintedState === 'awaiting_verification' && emailConfirmed) {
    return 'verified_pending_plan'
  }
  return hintedState
}

export const normalizeRoleForLifecycle = (role?: string | null) => {
  const normalized = asString(role).toLowerCase()
  if (normalized === 'coach' || normalized === 'athlete') return normalized
  if (ORG_ROLES.has(normalized)) return 'org_admin'
  if (normalized === 'admin') return 'admin'
  return normalized || 'athlete'
}

const normalizeExactTierForLifecycleRole = (role: string, tier?: string | null) => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const normalizedTier = asString(tier).toLowerCase()

  if (!normalizedTier) return null

  if (normalizedRole === 'coach') {
    if (normalizedTier === 'starter' || normalizedTier === 'pro' || normalizedTier === 'elite') {
      return normalizeCoachTier(normalizedTier)
    }
    return null
  }

  if (normalizedRole === 'athlete') {
    if (normalizedTier === 'explore' || normalizedTier === 'train' || normalizedTier === 'family') {
      return normalizeAthleteTier(normalizedTier)
    }
    return null
  }

  if (normalizedRole === 'org_admin') {
    if (normalizedTier === 'standard' || normalizedTier === 'growth' || normalizedTier === 'enterprise') {
      return normalizeOrgTier(normalizedTier)
    }
    return null
  }

  return normalizedTier
}

export const normalizeTierForLifecycleRole = (role: string, tier?: string | null) => {
  return normalizeExactTierForLifecycleRole(role, tier)
}

export const applyLifecycleEvent = (
  metadata: Record<string, any>,
  event: LifecycleEvent,
  payload?: { tier?: string | null }
) => {
  const nextMetadata = { ...metadata }
  const role = normalizeRoleForLifecycle(metadata.active_role || metadata.role)
  const selectedTier = payload?.tier
    ? normalizeTierForLifecycleRole(role, payload.tier)
    : normalizeTierForLifecycleRole(role, metadata.selected_tier)
  const nowIso = new Date().toISOString()

  if (selectedTier) nextMetadata.selected_tier = selectedTier
  nextMetadata.lifecycle_updated_at = nowIso

  if (event === 'signup_submitted') nextMetadata.lifecycle_state = 'awaiting_verification'
  if (event === 'verification_confirmed') nextMetadata.lifecycle_state = 'verified_pending_plan'
  if (event === 'plan_selected') nextMetadata.lifecycle_state = 'plan_selected'
  if (event === 'checkout_started') nextMetadata.lifecycle_state = 'checkout_in_progress'
  if (event === 'checkout_completed') nextMetadata.lifecycle_state = 'active'
  if (event === 'account_suspended') nextMetadata.lifecycle_state = 'suspended'
  if (event === 'account_unsuspended') {
    const previousState = normalizeLifecycleState(metadata.lifecycle_state)
    nextMetadata.lifecycle_state = previousState === 'suspended' ? 'verified_pending_plan' : previousState
  }

  return nextMetadata
}

export const computeLifecycleState = ({
  role,
  emailConfirmed,
  suspended,
  selectedTier,
  activeTier,
  lifecycleStateHint,
}: {
  role: string
  emailConfirmed: boolean
  suspended: boolean
  selectedTier?: string | null
  activeTier?: string | null
  lifecycleStateHint?: string | null
}): LifecycleState => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const normalizedSelectedTier = normalizeTierForLifecycleRole(normalizedRole, selectedTier)
  const normalizedActiveTier = normalizeTierForLifecycleRole(normalizedRole, activeTier)
  const hintedState = normalizeLifecycleState(lifecycleStateHint)
  // Whether an explicit lifecycle_state value was stored (not just the normalizeLifecycleState default)
  const hasExplicitHint = typeof lifecycleStateHint === 'string' && lifecycleStateHint.trim() !== ''

  if (suspended || hintedState === 'suspended') return 'suspended'

  // Only block on unconfirmed email when the hint also says awaiting_verification.
  // If an explicit hint says the user has advanced past verification, trust it —
  // email_confirmed_at can lag in the JWT after a fresh OTP verification.
  if (!emailConfirmed) {
    if (hasExplicitHint && hintedState !== 'awaiting_verification') {
      // fall through: hint is authoritative, email_confirmed_at is stale
    } else {
      return 'awaiting_verification'
    }
  }

  // When lifecycle_state is explicitly set to verified_pending_plan, honour it.
  // selected_tier may be pre-populated from signup URL params and must NOT cause
  // a skip to plan_selected before the user visits the select-plan page.
  if (hasExplicitHint && hintedState === 'verified_pending_plan') return 'verified_pending_plan'

  if (!normalizedSelectedTier && !normalizedActiveTier) return 'verified_pending_plan'
  if (normalizedSelectedTier && !normalizedActiveTier) {
    return hintedState === 'checkout_in_progress' ? 'checkout_in_progress' : 'plan_selected'
  }
  if (!normalizedSelectedTier && normalizedActiveTier) return 'active'
  if (normalizedSelectedTier && normalizedActiveTier && normalizedSelectedTier !== normalizedActiveTier) {
    return 'checkout_in_progress'
  }
  return 'active'
}

export const resolveLifecycleNextPath = ({
  role,
  state,
  selectedTier,
}: {
  role: string
  state: LifecycleState
  selectedTier?: string | null
}) => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const normalizedSelectedTier = normalizeTierForLifecycleRole(normalizedRole, selectedTier)

  if (state === 'awaiting_verification') {
    if (normalizedRole === 'coach' || normalizedRole === 'athlete' || normalizedRole === 'org_admin') {
      const tierParam = normalizedSelectedTier ? `&tier=${encodeURIComponent(normalizedSelectedTier)}` : ''
      return `/auth/verify?role=${normalizedRole}${tierParam}`
    }
    return '/auth/verify'
  }

  if (state === 'verified_pending_plan') {
    if (normalizedRole === 'coach' || normalizedRole === 'athlete' || normalizedRole === 'org_admin') {
      const tierParam = normalizedSelectedTier ? `&tier=${encodeURIComponent(normalizedSelectedTier)}` : ''
      return `/select-plan?role=${normalizedRole}${tierParam}`
    }
    return roleToPath(normalizedRole)
  }

  if (state === 'plan_selected' || state === 'checkout_in_progress') {
    if (normalizedRole === 'coach' || normalizedRole === 'athlete' || normalizedRole === 'org_admin') {
      const tier = normalizedSelectedTier || normalizeTierForLifecycleRole(normalizedRole, null) || ''
      const tierParam = tier ? `&tier=${encodeURIComponent(tier)}` : ''
      return `/checkout?role=${normalizedRole}${tierParam}`
    }
  }

  if (state === 'suspended') return '/login?error=Account%20suspended'
  return roleToPath(normalizedRole)
}

export const buildLifecycleSnapshot = ({
  role,
  emailConfirmed,
  suspended,
  selectedTier,
  activeTier,
  lifecycleStateHint,
}: {
  role: string
  emailConfirmed: boolean
  suspended: boolean
  selectedTier?: string | null
  activeTier?: string | null
  lifecycleStateHint?: string | null
}): LifecycleSnapshot => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const normalizedSelectedTier = normalizeTierForLifecycleRole(normalizedRole, selectedTier)
  const normalizedActiveTier = normalizeTierForLifecycleRole(normalizedRole, activeTier)
  // Fast path: if the DB returned a real activeTier (user has a plan),
  // treat them as active regardless of selected_tier in JWT.
  const hasActivePlan = Boolean(normalizedActiveTier)
  const state = (!suspended && emailConfirmed && hasActivePlan)
    ? ('active' as LifecycleState)
    : computeLifecycleState({
        role: normalizedRole,
        emailConfirmed,
        suspended,
        selectedTier: normalizedSelectedTier,
        activeTier: normalizedActiveTier,
        lifecycleStateHint,
      })
  return {
    role: normalizedRole,
    state,
    selectedTier: normalizedSelectedTier,
    activeTier: normalizedActiveTier,
    nextPath: resolveLifecycleNextPath({ role: normalizedRole, state, selectedTier: normalizedSelectedTier }),
    emailConfirmed,
    suspended,
  }
}

export const resolveLifecycleActiveTierFromBilling = ({
  role,
  billingInfo,
  selectedTierHint,
}: {
  role: string
  billingInfo: Pick<BillingInfoSnapshot, 'status' | 'tier'>
  selectedTierHint?: string | null
}) => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const normalizedTier =
    normalizeTierForLifecycleRole(normalizedRole, billingInfo.tier)
    || normalizeTierForLifecycleRole(normalizedRole, selectedTierHint)
  if (!normalizedTier || !isBillingAccessActive(billingInfo.status)) return null
  return normalizedTier
}

export const resolveBillingInfoForLifecycle = async ({
  userId,
  role,
  selectedTierHint,
  orgIdHint,
  resolveLiveBillingInfo = ({ userId: nextUserId, billingRole, orgIdHint: nextOrgIdHint }: { userId: string; billingRole: 'coach' | 'athlete' | 'org'; orgIdHint?: string | null }) =>
    resolveBillingInfoForActor({ userId: nextUserId, billingRole, orgIdHint: nextOrgIdHint }),
  resolveStoredBillingInfo = ({
    userId: nextUserId,
    billingRole,
    selectedTierHint: nextSelectedTierHint,
    orgIdHint: nextOrgIdHint,
  }: {
    userId: string
    billingRole: 'coach' | 'athlete' | 'org'
    selectedTierHint?: string | null
    orgIdHint?: string | null
  }) =>
    resolveDbBillingInfoForActor({
      userId: nextUserId,
      billingRole,
      selectedTierHint: nextSelectedTierHint,
      orgIdHint: nextOrgIdHint,
    }),
}: {
  userId: string
  role: string
  selectedTierHint?: string | null
  orgIdHint?: string | null
  resolveLiveBillingInfo?: (args: { userId: string; billingRole: 'coach' | 'athlete' | 'org'; orgIdHint?: string | null }) => Promise<BillingInfoSnapshot>
  resolveStoredBillingInfo?: (args: {
    userId: string
    billingRole: 'coach' | 'athlete' | 'org'
    selectedTierHint?: string | null
    orgIdHint?: string | null
  }) => Promise<BillingInfoSnapshot>
}) => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const billingRole = resolveBillingRole(normalizedRole)
  if (!billingRole) return null

  try {
    return await resolveLiveBillingInfo({ userId, billingRole, orgIdHint })
  } catch {
    return resolveStoredBillingInfo({ userId, billingRole, selectedTierHint, orgIdHint })
  }
}

export const getActiveTierForUser = async ({
  supabase,
  userId,
  role,
  selectedTierHint,
  orgIdHint,
}: {
  supabase: any
  userId: string
  role: string
  selectedTierHint?: string | null
  orgIdHint?: string | null
}) => {
  const normalizedRole = normalizeRoleForLifecycle(role)
  const billingInfo = await resolveBillingInfoForLifecycle({
    userId,
    role: normalizedRole,
    selectedTierHint,
    orgIdHint,
  })

  const activeBillingTier = billingInfo
    ? resolveLifecycleActiveTierFromBilling({
        role: normalizedRole,
        billingInfo,
        selectedTierHint,
      })
    : null

  if (activeBillingTier) {
    return activeBillingTier
  }

  if (resolveBillingRole(normalizedRole)) {
    const storedBillingInfo = billingInfo || await resolveDbBillingInfoForActor({
      userId,
      billingRole: resolveBillingRole(normalizedRole)!,
      selectedTierHint,
      orgIdHint,
    })
    const storedActiveTier = resolveLifecycleActiveTierFromBilling({
      role: normalizedRole,
      billingInfo: storedBillingInfo,
      selectedTierHint,
    })
    if (storedActiveTier) {
      return storedActiveTier
    }
  }

  if (normalizedRole === 'coach') {
    const hintedTier = normalizeTierForLifecycleRole(normalizedRole, selectedTierHint)
    return hintedTier
  }
  if (normalizedRole === 'athlete') {
    const hintedTier = normalizeTierForLifecycleRole(normalizedRole, selectedTierHint)
    return hintedTier
  }
  if (normalizedRole === 'org_admin') {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!membership?.org_id) return null
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('plan')
      .eq('org_id', membership.org_id)
      .maybeSingle()
    return asString(orgSettings?.plan) || null
  }
  return null
}
