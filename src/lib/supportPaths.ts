const ORG_SUPPORT_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

export const resolveSupportDashboardPath = (role?: string | null) => {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'coach' || normalized === 'assistant_coach') return '/open-app'
  if (normalized === 'athlete') return '/open-app'
  if (ORG_SUPPORT_ROLES.has(normalized)) return '/open-app'
  if (normalized === 'guardian') return '/open-app'
  return '/support'
}
