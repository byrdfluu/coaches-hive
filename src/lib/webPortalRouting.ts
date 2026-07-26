import { getCanonicalAdminRole } from '@/lib/adminRoles'
import { ORG_ROLE_SET } from '@/lib/sessionRoleState'

export const webPortalPathForRole = (role?: string | null) => {
  const normalized = getCanonicalAdminRole(role) || String(role || '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'superadmin') return '/admin'
  if (normalized === 'coach' || normalized === 'assistant_coach') return '/coach/dashboard'
  if (normalized === 'athlete') return '/athlete/dashboard'
  if (ORG_ROLE_SET.has(normalized)) return '/org'
  return null
}

export const resolveWebPortalPath = ({
  activeRole,
  baseRole,
  roles,
}: {
  activeRole?: string | null
  baseRole?: string | null
  roles?: string[]
}) => {
  for (const role of [activeRole, baseRole, ...(roles || [])]) {
    const path = webPortalPathForRole(role)
    if (path) return path
  }
  return null
}
