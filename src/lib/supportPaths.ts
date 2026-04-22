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
  if (normalized === 'coach' || normalized === 'assistant_coach') return '/coach/support'
  if (normalized === 'athlete') return '/athlete/support'
  if (ORG_SUPPORT_ROLES.has(normalized)) return '/org/support'
  if (normalized === 'guardian') return '/guardian/dashboard'
  return '/support'
}
