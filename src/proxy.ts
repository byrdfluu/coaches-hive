import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { roleToPath } from '@/lib/roleRedirect'
import {
  isAthleteApiDbGuardedPath,
  isAuthSensitivePath,
  isBillingRecoveryApiPath,
  isBillingRecoveryPagePath,
  isMobileBearerAuthApiPath,
  isOrgPublicPage,
  isPublicAthleteProfilePath,
  isLegacyPublicCoachProfilePath,
  isPublicApiPath,
  isRetiredPortalPagePath,
  matchesPathPrefix,
  requiresOrgMembershipGuardForPath,
} from '@/lib/middlewarePolicy'
import { getSessionRoleState, ORG_ROLE_SET, resolveEffectiveSessionRole } from '@/lib/sessionRoleState'
import { assertCoachesHiveSupabaseProject } from '@/lib/supabaseProject'
import {
  resolveAccountStateResponse,
  resolveAdminAccessEnforcementResponse,
  resolveBillingEnforcementResponse,
  resolveLifecycleEnforcementResponse,
  resolveOrgMembershipEnforcementResponse,
} from '@/lib/middlewareEnforcement'
import { isProtectedOwnerEmail } from '@/lib/protectedAccounts'

type RateLimitState = {
  count: number
  resetAt: number
}

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 120
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000
const AUTH_RATE_LIMIT_MAX = 10
const SENSITIVE_RATE_LIMIT_MAX = 30
const JSON_BODY_LIMIT_BYTES = 256 * 1024
const UPLOAD_BODY_LIMIT_BYTES = 10 * 1024 * 1024
const CALLBACK_PATHS = ['/auth/mobile-callback', '/auth/mobile-invite', '/auth/invite', '/auth/confirm', '/invite', '/auth/callback']
const SENSITIVE_API_MARKERS = ['/upload', '/proof', '/calendar']
const PRODUCTION_ORIGINS = new Set([
  'https://app.coacheshive.com',
  'https://coacheshive.com',
  'https://www.coacheshive.com',
])
const DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

const rateLimitStore = (() => {
  const globalRef = globalThis as unknown as { __chRateLimitStore?: Map<string, RateLimitState> }
  if (!globalRef.__chRateLimitStore) {
    globalRef.__chRateLimitStore = new Map()
  }
  return globalRef.__chRateLimitStore
})()

const evictExpiredRateLimitEntries = () => {
  const now = Date.now()
  Array.from(rateLimitStore.entries()).forEach(([key, state]) => {
    if (now > state.resetAt) rateLimitStore.delete(key)
  })
}

const checkRateLimit = (key: string, maxRequests = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS) => {
  const now = Date.now()
  // Middleware runtimes must not start background timers. Clean up opportunistically
  // when an isolate's small in-memory store grows instead.
  if (rateLimitStore.size > 1_000) evictExpiredRateLimitEntries()
  const current = rateLimitStore.get(key)
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  current.count += 1
  if (current.count > maxRequests) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }
  return { allowed: true, retryAfter: 0 }
}

// Use the last hop from x-forwarded-for to prevent spoofing by untrusted clients.
// Vercel's edge always appends the real client IP as the last entry.
const resolveClientIp = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean)
  return hops[hops.length - 1] || 'unknown'
}

const requestIdFor = (req: NextRequest) => req.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID()

const allowedOrigins = () => {
  const values = String(process.env.COACHESHIVE_STAGING_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  const developmentOrigins = process.env.NODE_ENV === 'production' ? [] : Array.from(DEVELOPMENT_ORIGINS)
  return new Set([...Array.from(PRODUCTION_ORIGINS), ...developmentOrigins, ...values])
}

const isAllowedCallbackHost = (req: NextRequest) => {
  if (process.env.NODE_ENV !== 'production') return true
  const origin = req.nextUrl.origin
  return allowedOrigins().has(origin)
}

const publicError = (requestId: string, code: string, message: string, status: number, retryAfter?: number) =>
  NextResponse.json({ error: { code, message, request_id: requestId } }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-ID': requestId,
      ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
    },
  })

const applyCors = (response: NextResponse, origin: string | null) => {
  if (origin && allowedOrigins().has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Workspace-ID, X-Request-ID')
    response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.append('Vary', 'Origin')
  }
  return response
}

const decodeJwtIat = (token?: string | null) => {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return Number(payload?.iat || 0) || null
  } catch {
    return null
  }
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')
  const requestId = requestIdFor(req)
  const origin = req.headers.get('origin')
  const ip = resolveClientIp(req)
  const isPublicApi = isApi && isPublicApiPath(pathname)
  const isOrgPublicPortalPage = isOrgPublicPage(pathname)
  const isAthletePublicProfilePage = isPublicAthleteProfilePath(pathname)
  const isLegacyCoachProfilePage = isLegacyPublicCoachProfilePath(pathname)

  if (isApi && origin && !allowedOrigins().has(origin)) {
    return publicError(requestId, 'origin_denied', 'This origin is not allowed.', 403)
  }
  if (isApi && req.method === 'OPTIONS') {
    return applyCors(new NextResponse(null, { status: 204 }), origin)
  }

  if (CALLBACK_PATHS.includes(pathname)) {
    if (!isAllowedCallbackHost(req)) return publicError(requestId, 'invalid_callback_host', 'This secure link is invalid.', 400)
    const { allowed, retryAfter } = checkRateLimit(`callback:${ip}:${pathname}`, AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS)
    if (!allowed) return publicError(requestId, 'rate_limited', 'Too many attempts. Please request a new link later.', 429, retryAfter)
  }

  if (isOrgPublicPortalPage) {
    const slug = pathname.split('/').filter(Boolean)[1]
    if (slug) {
      const redirectUrl = new URL(`/organizations/${encodeURIComponent(slug)}`, req.url)
      return NextResponse.redirect(redirectUrl)
    }
  }

  if (!isApi && isRetiredPortalPagePath(pathname)) {
    const openAppUrl = new URL('/open-app', req.url)
    openAppUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(openAppUrl)
  }

  if (isApi) {
    if (isAuthSensitivePath(pathname)) {
      const { allowed, retryAfter } = checkRateLimit(`auth:${ip}:${pathname}`, AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS)
      if (!allowed) {
        return applyCors(publicError(requestId, 'rate_limited', 'Too many attempts. Please wait before trying again.', 429, retryAfter), origin)
      }
    }

    if (SENSITIVE_API_MARKERS.some(marker => pathname.includes(marker))) {
      const { allowed, retryAfter } = checkRateLimit(`sensitive:${ip}:${pathname}`, SENSITIVE_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
      if (!allowed) return applyCors(publicError(requestId, 'rate_limited', 'Too many requests. Please try again shortly.', 429, retryAfter), origin)
    }

    const { allowed, retryAfter } = checkRateLimit(`${ip}:${pathname}`)
    if (!allowed) {
      return applyCors(publicError(requestId, 'rate_limited', 'Too many requests. Please try again shortly.', 429, retryAfter), origin)
    }

    const contentLength = Number(req.headers.get('content-length') || 0)
    const isUpload = pathname.includes('/upload') || (req.headers.get('content-type') || '').includes('multipart/form-data')
    const bodyLimit = isUpload ? UPLOAD_BODY_LIMIT_BYTES : JSON_BODY_LIMIT_BYTES
    if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
      return applyCors(publicError(requestId, 'payload_too_large', 'The request is too large.', 413), origin)
    }

    if (!isPublicApi && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers.get('content-type') || ''
      const contentLength = req.headers.get('content-length') || '0'
      const hasBody = contentLength !== '0'
      const isJson = contentType.includes('application/json')
      const isMultipart = contentType.includes('multipart/form-data')

      if (hasBody && !isJson && !isMultipart) {
        return NextResponse.json(
          { error: 'Unsupported content type. Use application/json or multipart/form-data.' },
          { status: 415 },
        )
      }
    }

    if (isPublicApi) {
      return applyCors(NextResponse.next(), origin)
    }
  }

  const res = applyCors(NextResponse.next(), origin)
  if (CALLBACK_PATHS.includes(pathname)) {
    res.headers.set('Cache-Control', 'private, no-store, max-age=0')
    res.headers.set('Referrer-Policy', 'no-referrer')
    res.headers.set('X-Content-Type-Options', 'nosniff')
  }
  const supabase = createMiddlewareClient({ req, res }, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? assertCoachesHiveSupabaseProject(process.env.NEXT_PUBLIC_SUPABASE_URL)
      : 'https://placeholder.supabase.co',
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const impersonateRole = req.cookies.get('ch_impersonate_role')?.value
  const impersonateUser = req.cookies.get('ch_impersonate_user')?.value
  const testRole = req.cookies.get('ch_test_role')?.value
  const testModeEnabled = req.cookies.get('ch_test_mode')?.value === '1'

  const isCoach = (pathname === '/coach' || pathname.startsWith('/coach/')) && !isLegacyCoachProfilePage
  const isAthlete = (pathname === '/athlete' || pathname.startsWith('/athlete/')) && !isAthletePublicProfilePage
  const isAdminLogin = pathname === '/admin/login'
  const isAdmin = (pathname === '/admin' || pathname.startsWith('/admin/')) && !isAdminLogin
  const isOrg = pathname === '/org' || pathname.startsWith('/org/')
  const isLeague = pathname === '/league' || pathname.startsWith('/league/')
  const isSelectPlan = pathname.startsWith('/select-plan')
  const isOrgApi = pathname.startsWith('/api/org')
  const isCoachApi = pathname.startsWith('/api/coach')
  const isAthleteApi = pathname.startsWith('/api/athlete')
  const isAdminApi = pathname.startsWith('/api/admin')
  const isProtectedApi = isApi && !isPublicApi
  const hasBearerAuthorization = /^Bearer\s+.+/i.test(req.headers.get('authorization') || '')
  const shouldDeferToBearerApiAuth = isMobileBearerAuthApiPath(pathname) && hasBearerAuthorization
  const isBillingRecoveryPage = isBillingRecoveryPagePath(pathname)
  const isBillingRecoveryApi = isBillingRecoveryApiPath(pathname)
  const isOrgOnboardingPage = matchesPathPrefix(pathname, '/org/onboarding')
  const requiresOrgMembershipGuard = requiresOrgMembershipGuardForPath(pathname)

  const isCoachPortalPath = (pathname === '/coach' || pathname.startsWith('/coach/')) && !isLegacyCoachProfilePage
  const isAthletePortalPath = pathname === '/athlete' || (pathname.startsWith('/athlete/') && !isAthletePublicProfilePage)
  const isAdminPortalPath = (pathname === '/admin' || pathname.startsWith('/admin/')) && !isAdminLogin
  const isOrgPortalPath = pathname === '/org' || pathname.startsWith('/org/')
  const hasTestPortalAccess = process.env.NODE_ENV !== 'production' && testModeEnabled && (
    (testRole === 'coach' && isCoachPortalPath)
    || (testRole === 'athlete' && isAthletePortalPath)
    || (testRole === 'admin' && isAdminPortalPath)
    || (testRole === 'org' && isOrgPortalPath)
  )

  if (pathname === '/admin/debug' && process.env.NODE_ENV !== 'production') {
    return res
  }

  if ((isCoach || isAthlete || isAdmin || isLeague || isSelectPlan || (isOrg && !isOrgPublicPortalPage) || isProtectedApi) && !session) {
    if (!isApi && hasTestPortalAccess) {
      return res
    }
    if (isApi && shouldDeferToBearerApiAuth) {
      return res
    }
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const signInBase = isAdmin ? '/admin/login' : '/login'
    const redirectUrl = new URL(signInBase, req.url)
    const nextPath = `${pathname}${req.nextUrl.search || ''}`
    if (nextPath && nextPath !== '/login') {
      redirectUrl.searchParams.set('next', nextPath)
    }
    if (isCoach || isCoachApi) {
      redirectUrl.searchParams.set('role', 'coach')
    } else if (isAthlete || isAthleteApi) {
      redirectUrl.searchParams.set('role', 'athlete')
    } else if (isOrg || isOrgApi) {
      redirectUrl.searchParams.set('role', 'organization')
    } else if (isLeague) {
      redirectUrl.searchParams.set('role', 'league')
    }
    return NextResponse.redirect(redirectUrl)
  }

  if (session) {
    if (isApi && SENSITIVE_API_MARKERS.some(marker => pathname.includes(marker))) {
      const accountLimit = checkRateLimit(`account:${session.user.id}:${pathname}`, SENSITIVE_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
      if (!accountLimit.allowed) return applyCors(publicError(requestId, 'rate_limited', 'Too many requests. Please try again shortly.', 429, accountLimit.retryAfter), origin)
    }
    const isProtectedOwner = isProtectedOwnerEmail(session.user.email)
    const roleState = getSessionRoleState(session.user.user_metadata)
    const { baseRole, adminAccess } = roleState
    const isAdminUser = adminAccess.isAdmin
    const tokenIat = decodeJwtIat(session.access_token)

    const requiresAccountState = isCoach
      || isAthlete
      || isAdmin
      || isLeague
      || isSelectPlan
      || (isOrg && !isOrgPublicPortalPage)
      || isProtectedApi
    const accountStateResponse = requiresAccountState
      ? resolveAccountStateResponse({
          req,
          isApi,
          roleState,
          tokenIat,
          isProtectedOwner,
        })
      : null
    if (accountStateResponse) {
      return accountStateResponse
    }

    const canImpersonate = isAdminUser && impersonateRole && impersonateUser
    const preferredOrgRole = roleState.preferredOrgRole
    const requestedPortalRole = isCoach || isCoachApi
      ? 'coach'
      : isAthlete || isAthleteApi
        ? 'athlete'
        : isOrg
          ? preferredOrgRole
          : null
    const role = resolveEffectiveSessionRole({
      roleState,
      requestedPortalRole,
      impersonateRole,
      canImpersonate: Boolean(canImpersonate),
    })
    const isPlatformAdmin = (isAdminUser || isProtectedOwner) && !canImpersonate
    const lifecycleResponse = isProtectedOwner ? null : await resolveLifecycleEnforcementResponse({
      req,
      pathname,
      isApi,
      isPublicApi,
      role,
      roleState,
      session: {
        user: {
          id: session.user.id,
          email_confirmed_at: session.user.email_confirmed_at,
          confirmed_at: session.user.confirmed_at,
        },
      },
      supabase,
    })
    if (lifecycleResponse) {
      return lifecycleResponse
    }

    const billingResponse = isProtectedOwner ? null : await resolveBillingEnforcementResponse({
      req,
      pathname,
      isApi,
      role,
      roleState,
      userId: session.user.id,
      supabase,
      isBillingRecoveryPage,
      isBillingRecoveryApi,
    })
    if (billingResponse) {
      return billingResponse
    }

    const adminAccessResponse = await resolveAdminAccessEnforcementResponse({
      req,
      pathname,
      method: req.method,
      isApi,
      isAdminRoute: isAdmin,
      isAdminApi,
      isAdminUser,
      adminAccess,
      session: {
        user: {
          app_metadata: (session.user.app_metadata || {}) as Record<string, unknown>,
        },
        access_token: session.access_token,
      },
      supabase,
    })
    if (adminAccessResponse) {
      return adminAccessResponse
    }

    if (isCoachApi && role !== 'coach' && !isAdminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (isAthleteApi && role !== 'athlete' && !isAdminUser && !isAthleteApiDbGuardedPath(pathname)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (isCoach && role !== 'coach') {
      return NextResponse.redirect(new URL(roleToPath(role || baseRole), req.url))
    }
    if (isAthlete && role !== 'athlete') {
      return NextResponse.redirect(new URL(roleToPath(role || baseRole), req.url))
    }
    if (isAdmin && !isAdminUser) {
      return NextResponse.redirect(new URL(roleToPath(baseRole), req.url))
    }
    if (isSelectPlan && role !== 'coach' && role !== 'athlete' && !ORG_ROLE_SET.has(String(role || ''))) {
      // After Google OAuth, the JWT may not yet reflect the updated role — the role
      // is written to the DB by updateUser in /auth/callback but the new JWT takes one
      // additional round-trip to reach the browser. Trust the URL ?role= param so new
      // users can reach the plan selection page; the page validates the session itself.
      const urlRoleParam = req.nextUrl.searchParams.get('role') || ''
      const isValidUrlRole =
        urlRoleParam === 'coach'
        || urlRoleParam === 'athlete'
        || urlRoleParam === 'org_admin'
        || ORG_ROLE_SET.has(urlRoleParam)
      if (!isValidUrlRole) {
        return NextResponse.redirect(new URL(roleToPath(role || baseRole), req.url))
      }
    }
    const orgMembershipResponse = await resolveOrgMembershipEnforcementResponse({
      req,
      pathname,
      role,
      requiresOrgMembershipGuard,
      isPlatformAdmin,
      isOrgOnboardingPage,
      isOrgApi,
      currentOrgId: roleState.currentOrgId,
      session: {
        user: {
          id: session.user.id,
        },
      },
      supabase,
    })
    if (orgMembershipResponse) {
      return orgMembershipResponse
    }
  }

  return res
}

export const config = {
  matcher: ['/coach/:path*', '/athlete/:path*', '/admin/:path*', '/org/:path*', '/select-plan/:path*', '/checkout/:path*', '/api/:path*', '/auth/:path*', '/invite'],
}
