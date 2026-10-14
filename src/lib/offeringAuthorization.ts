export const PROGRAM_MANAGEMENT_ROLES = ['org_admin', 'program_director'] as const

const programManagementRoles = new Set<string>(PROGRAM_MANAGEMENT_ROLES)

export const canManageProgramOfferings = (roles: readonly string[]) =>
  roles.some((role) => programManagementRoles.has(String(role || '').trim().toLowerCase()))
