export const ADMIN_TEAM_ROLES = ['superadmin', 'support', 'finance', 'ops'] as const

export type AdminTeamRole = (typeof ADMIN_TEAM_ROLES)[number]
type CanonicalAdminRole = 'admin' | 'superadmin'
type AdminMetadataLike = {
  role?: unknown
  admin_team_role?: unknown
} | null | undefined

export type AdminPermission =
  | 'users.read'
  | 'users.manage'
  | 'impersonate'
  | 'support.read'
  | 'support.manage'
  | 'support.refund'
  | 'finance.read'
  | 'finance.manage'
  | 'verifications.manage'
  | 'operations.manage'
  | 'security.manage'

const PERMISSIONS: Record<AdminTeamRole, Set<AdminPermission>> = {
  superadmin: new Set<AdminPermission>([
    'users.read',
    'users.manage',
    'impersonate',
    'support.read',
    'support.manage',
    'support.refund',
    'finance.read',
    'finance.manage',
    'verifications.manage',
    'operations.manage',
    'security.manage',
  ]),
  support: new Set<AdminPermission>([
    'users.read',
    'impersonate',
    'support.read',
    'support.manage',
  ]),
  finance: new Set<AdminPermission>([
    'users.read',
    'support.read',
    'support.manage',
    'support.refund',
    'finance.read',
    'finance.manage',
  ]),
  ops: new Set<AdminPermission>([
    'users.read',
    'support.read',
    'verifications.manage',
    'operations.manage',
  ]),
}

const normalizeValue = (value: unknown) => {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export const normalizeAdminTeamRole = (value: unknown): AdminTeamRole => {
  const normalized = normalizeValue(value)
  if (normalized === 'support' || normalized === 'finance' || normalized === 'ops' || normalized === 'superadmin') {
    return normalized
  }
  return 'superadmin'
}

export const getCanonicalAdminRole = (value: unknown): CanonicalAdminRole | null => {
  const normalized = normalizeValue(value)
  if (normalized === 'superadmin') return 'superadmin'
  if (normalized === 'admin' || normalized === 'support' || normalized === 'finance' || normalized === 'ops') {
    return 'admin'
  }
  return null
}

export const resolveAdminTeamRole = (role: unknown, adminTeamRole?: unknown): AdminTeamRole | null => {
  const normalizedRole = normalizeValue(role)
  if (normalizedRole === 'superadmin') return 'superadmin'
  if (normalizedRole === 'support' || normalizedRole === 'finance' || normalizedRole === 'ops') {
    return normalizedRole
  }
  if (normalizedRole === 'admin') return normalizeAdminTeamRole(adminTeamRole)
  return null
}

export const resolveAdminAccess = (metadata?: AdminMetadataLike) => {
  const role = getCanonicalAdminRole(metadata?.role)
  const teamRole = resolveAdminTeamRole(metadata?.role, metadata?.admin_team_role)
  return {
    role,
    teamRole,
    isAdmin: teamRole !== null,
    isSuperadmin: teamRole === 'superadmin',
  }
}

export const hasAdminPermission = (role: AdminTeamRole, permission: AdminPermission) =>
  PERMISSIONS[role].has(permission)
