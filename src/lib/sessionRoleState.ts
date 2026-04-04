import { getCanonicalAdminRole, resolveAdminAccess } from '@/lib/adminRoles'

export const ORG_ROLE_SET = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

export type SessionMetadataLike = Record<string, unknown> | null | undefined

export type SessionRoleState = {
  baseRole: string | null
  activeRole: string | null
  currentRole: string | null
  metadataRoles: string[]
  availableRoles: string[]
  preferredOrgRole: string | null
  currentOrgId: string | null
  selectedTier: string | null
  lifecycleState: string | null
  subscriptionStatus: string | null
  suspended: boolean
  suspiciousLogin: boolean
  forceLogoutAfter: string | null
  adminAccess: ReturnType<typeof resolveAdminAccess>
}

const normalizeString = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizeRoleCandidate = (value: unknown) => {
  const canonicalAdminRole = getCanonicalAdminRole(value)
  if (canonicalAdminRole) return canonicalAdminRole
  return normalizeString(value) || null
}

const normalizeStringArray = (value: unknown, normalizer: (entry: unknown) => string | null) => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => normalizer(entry))
    .filter((entry, index, list): entry is string => Boolean(entry) && list.indexOf(entry) === index)
}

export const getSessionBaseRole = (metadata?: SessionMetadataLike) => normalizeRoleCandidate(metadata?.role)

export const getSessionActiveRole = (metadata?: SessionMetadataLike) => normalizeRoleCandidate(metadata?.active_role)

export const getSessionMetadataRoles = (metadata?: SessionMetadataLike) =>
  normalizeStringArray(metadata?.roles, normalizeRoleCandidate)

export const getSessionCurrentRole = (metadata?: SessionMetadataLike) =>
  getSessionActiveRole(metadata) || getSessionBaseRole(metadata)

export const getSessionRoleState = (metadata?: SessionMetadataLike): SessionRoleState => {
  const baseRole = getSessionBaseRole(metadata)
  const activeRole = getSessionActiveRole(metadata)
  const metadataRoles = getSessionMetadataRoles(metadata)
  const availableRoles = Array.from(new Set([baseRole, activeRole, ...metadataRoles].filter(Boolean))) as string[]

  return {
    baseRole,
    activeRole,
    currentRole: activeRole || baseRole,
    metadataRoles,
    availableRoles,
    preferredOrgRole: [activeRole, baseRole, ...metadataRoles].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0 && ORG_ROLE_SET.has(candidate),
    ) || null,
    currentOrgId: normalizeString(metadata?.current_org_id) || null,
    selectedTier: normalizeString(metadata?.selected_tier) || null,
    lifecycleState: normalizeString(metadata?.lifecycle_state) || null,
    subscriptionStatus: normalizeString(metadata?.subscription_status).toLowerCase() || null,
    suspended: Boolean(metadata?.suspended),
    suspiciousLogin: Boolean(metadata?.suspicious_login),
    forceLogoutAfter: normalizeString(metadata?.force_logout_after) || null,
    adminAccess: resolveAdminAccess(metadata),
  }
}

export const resolveEffectiveSessionRole = ({
  roleState,
  requestedPortalRole,
  impersonateRole,
  canImpersonate,
}: {
  roleState: SessionRoleState
  requestedPortalRole?: string | null
  impersonateRole?: string | null
  canImpersonate?: boolean
}) => {
  const normalizedRequestedRole = normalizeRoleCandidate(requestedPortalRole)
  const normalizedImpersonationRole = normalizeRoleCandidate(impersonateRole)

  if (canImpersonate && normalizedImpersonationRole) {
    return normalizedImpersonationRole
  }
  if (normalizedRequestedRole && roleState.availableRoles.includes(normalizedRequestedRole)) {
    return normalizedRequestedRole
  }
  return roleState.currentRole
}
