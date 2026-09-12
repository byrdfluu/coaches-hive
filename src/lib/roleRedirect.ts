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
  | 'league_admin'
  | 'division_admin'
  | 'finance_manager'
  | 'registrar'
  | 'compliance_manager'
  | 'read_only_auditor'

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const LEAGUE_ROLES = new Set(['league_admin','division_admin','finance_manager','registrar','compliance_manager','read_only_auditor'])

export const roleToPath = (role?: string | null) => {
  const normalizedRole = getCanonicalAdminRole(role) || String(role || '').trim().toLowerCase()
  if (normalizedRole === 'admin' || normalizedRole === 'superadmin') return '/admin'
  if (normalizedRole === 'coach' || normalizedRole === 'trainer') return '/coach/dashboard'
  if (normalizedRole === 'athlete' || normalizedRole === 'parent' || normalizedRole === 'guardian') return '/athlete/dashboard'
  if (normalizedRole === 'org' || normalizedRole === 'organization' || ORG_ROLES.has(normalizedRole)) return '/org'
  if (normalizedRole === 'league' || LEAGUE_ROLES.has(normalizedRole)) return '/league'
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
  if (normalizedRoles.includes('coach') || normalizedRoles.includes('trainer')) return 'coach'
  if (normalizedRoles.includes('athlete') || normalizedRoles.includes('parent') || normalizedRoles.includes('guardian')) return 'athlete'
  if (normalizedRoles.includes('org') || normalizedRoles.includes('organization')) return 'org_admin'
  const preferredLeagueRole = normalizedRoles.find((role) => LEAGUE_ROLES.has(role))
  if (preferredLeagueRole) return preferredLeagueRole
  const preferredOrgRole = normalizedRoles.find((role) => ORG_ROLES.has(role))
  if (preferredOrgRole) return preferredOrgRole

  return normalizedRoles[0] || null
}
