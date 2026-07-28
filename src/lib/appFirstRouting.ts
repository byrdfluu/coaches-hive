const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const matchesAnyPathPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => matchesPathPrefix(pathname, prefix))

export const RETIRED_PORTAL_PAGE_PREFIXES = [
  '/athlete',
  '/coach',
  '/org',
]

// Payments and billing management remain on web — the app deliberately
// sends users here for Stripe-managed operations (customer portal, cancel,
// seat management, marketplace checkout) that cannot run inside the mobile app.
export const RETAINED_PORTAL_WORKFLOW_PREFIXES = [
  '/athlete/waivers',
  '/athlete/payments',
  '/athlete/settings',
  '/athlete/marketplace/cart',
  '/athlete/marketplace/checkout',
  '/athlete/marketplace/orders',
  '/coach/settings',
  '/org/settings',
  '/org/billing',
  '/org/payments',
]

export const isRetainedPortalWorkflowPath = (pathname: string) =>
  matchesAnyPathPrefix(pathname, RETAINED_PORTAL_WORKFLOW_PREFIXES)

export const isRetiredPortalPagePath = (pathname: string) =>
  matchesAnyPathPrefix(pathname, RETIRED_PORTAL_PAGE_PREFIXES)
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
