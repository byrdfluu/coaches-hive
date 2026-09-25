export const MOBILE_AUTH_CALLBACK_URL = 'https://app.coacheshive.com/auth/mobile-callback'

const ALLOWED_NATIVE_PATH_PREFIXES = [
  '/athlete', '/coach', '/guardian', '/league', '/org', '/support', '/waivers',
]

export const safeNativeDestination = (value?: string | null) => {
  const trimmed = String(value || '').trim()
  try {
    const isAbsolute = /^https?:\/\//i.test(trimmed)
    if (!isAbsolute && (!trimmed.startsWith('/') || trimmed.startsWith('//'))) return '/org/messages'
    const parsed = new URL(trimmed, 'https://app.coacheshive.com')
    const trustedHost = parsed.hostname === 'coacheshive.com' || parsed.hostname.endsWith('.coacheshive.com')
    if (parsed.protocol !== 'https:' || !trustedHost) return '/org/messages'
    const path = `${parsed.pathname}${parsed.search}`
    return ALLOWED_NATIVE_PATH_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))
      ? path
      : '/org/messages'
  } catch {
    return '/org/messages'
  }
}

export const mobileOpenAppUrl = (value?: string | null) =>
  `https://app.coacheshive.com/open-app?from=${encodeURIComponent(safeNativeDestination(value))}`
