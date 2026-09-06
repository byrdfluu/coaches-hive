const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const matchesAnyPathPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => matchesPathPrefix(pathname, prefix))

const COACH_PORTAL_ROUTES = new Set([
  'active-athletes', 'athletes', 'attendance', 'availability', 'bookings', 'calendar',
  'dashboard', 'marketplace', 'messages', 'notes', 'notifications', 'onboarding',
  'orgs-teams', 'payments', 'plans', 'profile', 'programs', 'reports', 'retention',
  'revenue', 'reviews', 'settings', 'stripe-setup', 'support', 'waivers',
])

export const isPublicAthleteProfilePath = (pathname: string) =>
  false

// Older mobile clients shared /coach/:slug. Keep those links public while
// excluding every first-class coach portal route from the compatibility path.
export const isLegacyPublicCoachProfilePath = (pathname: string) => {
  const match = pathname.match(/^\/coach\/([^/]+)\/?$/i)
  if (!match) return false
  return !COACH_PORTAL_ROUTES.has(decodeURIComponent(match[1]).toLowerCase())
}

export const RETIRED_PORTAL_PAGE_PREFIXES = [
]

// Web portals are active for every customer role. This list now documents
// workflows that remain available on web rather than exceptions to app-only routing.
export const RETAINED_PORTAL_WORKFLOW_PREFIXES = [
  '/athlete',
  '/coach',
  '/org',
]

export const isRetainedPortalWorkflowPath = (pathname: string) =>
  matchesAnyPathPrefix(pathname, RETAINED_PORTAL_WORKFLOW_PREFIXES)

export const isRetiredPortalPagePath = (pathname: string) =>
  matchesAnyPathPrefix(pathname, RETIRED_PORTAL_PAGE_PREFIXES)
  && !isPublicAthleteProfilePath(pathname)
  && !isRetainedPortalWorkflowPath(pathname)

export const toAppFirstActionUrl = (value?: string | null) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return trimmed

  let internalPath = trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      const isCoachesHiveHost = parsed.hostname === 'coacheshive.com' || parsed.hostname.endsWith('.coacheshive.com')
      if (!isCoachesHiveHost) return trimmed
      internalPath = `${parsed.pathname}${parsed.search}`
    } catch {
      return trimmed
    }
  }

  if (!internalPath.startsWith('/') || internalPath.startsWith('//')) return trimmed
  const pathname = internalPath.split(/[?#]/, 1)[0]
  if (!isRetiredPortalPagePath(pathname)) return trimmed
  return `/open-app?from=${encodeURIComponent(internalPath)}`
}
