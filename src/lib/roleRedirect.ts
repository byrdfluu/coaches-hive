import { getCanonicalAdminRole } from '@/lib/adminRoles'

export type UserRole =
  | 'coach'
  | 'athlete'
  | 'admin'
  | 'superadmin'
  | 'support'
  | 'finance'
  | 'ops'
  | 'org_admin'
  | 'club_admin'
  | 'travel_admin'
  | 'school_admin'
  | 'athletic_director'
  | 'program_director'
  | 'team_manager'
  | 'guardian'

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

export const roleToPath = (role?: string | null) => {
  const normalizedRole = getCanonicalAdminRole(role) || String(role || '').trim().toLowerCase()
  if (normalizedRole === 'coach') return '/coach/dashboard'
  if (normalizedRole === 'athlete') return '/athlete/dashboard'
  if (normalizedRole === 'guardian') return '/guardian/dashboard'
  if (normalizedRole === 'admin' || normalizedRole === 'superadmin') return '/admin'
  if (
    normalizedRole === 'org_admin' ||
    normalizedRole === 'club_admin' ||
    normalizedRole === 'travel_admin' ||
    normalizedRole === 'school_admin' ||
    normalizedRole === 'athletic_director' ||
    normalizedRole === 'program_director' ||
    normalizedRole === 'team_manager'
  ) {
    return '/org'
  }
  return '/'
}

export const resolvePreferredSignInRole = ({
  baseRole,
  activeRole,
  roles,
}: {
  baseRole?: string | null
  activeRole?: string | null
  roles?: string[]
}) => {
  const normalizedRoles = Array.from(
    new Set(
      [activeRole, baseRole, ...(roles || [])]
        .map((value) => getCanonicalAdminRole(value) || String(value || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  )

  if (normalizedRoles.includes('superadmin')) return 'superadmin'
  if (normalizedRoles.includes('admin')) return 'admin'
  if (normalizedRoles.includes('coach')) return 'coach'
  if (normalizedRoles.includes('athlete')) return 'athlete'
  if (normalizedRoles.includes('guardian')) return 'guardian'

  const preferredOrgRole = normalizedRoles.find((role) => ORG_ROLES.has(role))
  if (preferredOrgRole) return preferredOrgRole

  return normalizedRoles[0] || null
}
