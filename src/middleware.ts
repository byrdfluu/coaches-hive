import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { roleToPath } from '@/lib/roleRedirect'
import {
  isAuthSensitivePath,
  isBillingRecoveryApiPath,
  isBillingRecoveryPagePath,
  isOrgPublicPage,
  isPublicApiPath,
  matchesPathPrefix,
  requiresOrgMembershipGuardForPath,
} from '@/lib/middlewarePolicy'
import { getSessionRoleState, ORG_ROLE_SET, resolveEffectiveSessionRole } from '@/lib/sessionRoleState'
import {
  resolveAccountStateResponse,
  resolveAdminAccessEnforcementResponse,
  resolveBillingEnforcementResponse,
  resolveLifecycleEnforcementResponse,
  resolveOrgMembershipEnforcementResponse,
} from '@/lib/middlewareEnforcement'

type RateLimitState = {
  count: number
  resetAt: number
}

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 120
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000
const AUTH_RATE_LIMIT_MAX = 10

const rateLimitStore = (() => {
  const globalRef = globalThis as unknown as { __chRateLimitStore?: Map<string, RateLimitState> }
  if (!globalRef.__chRateLimitStore) {
    globalRef.__chRateLimitStore = new Map()
  }
  return globalRef.__chRateLimitStore
})()

const checkRateLimit = (key: string) => {
  const now = Date.now()
  const current = rateLimitStore.get(key)
  if (!current || now > current.resetAt) {
    const next = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateLimitStore.set(key, next)
    return { allowed: true, retryAfter: 0 }
  }
  current.count += 1
  if (current.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }
  return { allowed: true, retryAfter: 0 }
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

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')
  const isPublicApi = isApi && isPublicApiPath(pathname)
  const isOrgPublicPortalPage = isOrgPublicPage(pathname)

  if (isOrgPublicPortalPage) {
    const slug = pathname.split('/').filter(Boolean)[1]
    if (slug) {
      const redirectUrl = new URL(`/organizations/${encodeURIComponent(slug)}`, req.url)
      return NextResponse.redirect(redirectUrl)
    }
  }

  if (isApi) {
    const forwarded = req.headers.get('x-forwarded-for') || ''
    const ip = forwarded.split(',')[0]?.trim() || 'unknown'

    if (isAuthSensitivePath(pathname)) {
      const authKey = `auth:${ip}:${pathname}`
      const now = Date.now()
      const current = rateLimitStore.get(authKey)
      if (!current || now > current.resetAt) {
        rateLimitStore.set(authKey, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS })
      } else {
        current.count += 1
        if (current.count > AUTH_RATE_LIMIT_MAX) {
          const retryAfter = Math.ceil((current.resetAt - now) / 1000)
          return NextResponse.json(
            { error: 'Too many attempts. Please wait before trying again.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          )
        }
      }
    }

    const key = `${ip}:${pathname}`
    const { allowed, retryAfter } = checkRateLimit(key)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
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
  }

  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res }, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const impersonateRole = req.cookies.get('ch_impersonate_role')?.value
  const impersonateUser = req.cookies.get('ch_impersonate_user')?.value
  const testRole = req.cookies.get('ch_test_role')?.value
  const testModeEnabled = req.cookies.get('ch_test_mode')?.value === '1'

  const isCoach = pathname.startsWith('/coach/')
  const isAthlete = pathname.startsWith('/athlete/')
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')
  const isOrg = pathname === '/org' || pathname.startsWith('/org/')
  const isGuardian = pathname.startsWith('/guardian/') && !pathname.startsWith('/guardian/accept-invite')
  const isSelectPlan = pathname.startsWith('/select-plan')
  const isOrgApi = pathname.startsWith('/api/org')
  const isCoachApi = pathname.startsWith('/api/coach')
  const isAthleteApi = pathname.startsWith('/api/athlete')
  const isAdminApi = pathname.startsWith('/api/admin')
  const isProtectedApi = isApi && !isPublicApi
  const isBillingRecoveryPage = isBillingRecoveryPagePath(pathname)
  const isBillingRecoveryApi = isBillingRecoveryApiPath(pathname)
  const isOrgOnboardingPage = matchesPathPrefix(pathname, '/org/onboarding')
  const requiresOrgMembershipGuard = requiresOrgMembershipGuardForPath(pathname)

  const isCoachPortalPath = pathname === '/coach' || pathname.startsWith('/coach/')
  const isAthletePortalPath = pathname === '/athlete' || pathname.startsWith('/athlete/')
  const isAdminPortalPath = pathname === '/admin' || pathname.startsWith('/admin/')
  const isOrgPortalPath = pathname === '/org' || pathname.startsWith('/org/')
  const hasTestPortalAccess = testModeEnabled && (
    (testRole === 'coach' && isCoachPortalPath)
    || (testRole === 'athlete' && isAthletePortalPath)
    || (testRole === 'admin' && isAdminPortalPath)
    || (testRole === 'org' && isOrgPortalPath)
  )

  if (pathname === '/coach' || pathname === '/athlete' || pathname === '/admin/debug') {
    return res
  }

  if ((isCoach || isAthlete || isAdmin || isGuardian || isSelectPlan || (isOrg && !isOrgPublicPortalPage) || isProtectedApi) && !session) {
    if (!isApi && hasTestPortalAccess) {
      return res
    }
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const redirectUrl = new URL('/login', req.url)
    const nextPath = `${pathname}${req.nextUrl.search || ''}`
    if (nextPath && nextPath !== '/login') {
      redirectUrl.searchParams.set('next', nextPath)
    }
    if (isCoach || isCoachApi) {
      redirectUrl.searchParams.set('role', 'coach')
    } else if (isAthlete || isAthleteApi) {
      redirectUrl.searchParams.set('role', 'athlete')
    }
    return NextResponse.redirect(redirectUrl)
  }

  if (session) {
    const roleState = getSessionRoleState(session.user.user_metadata)
    const { baseRole, adminAccess } = roleState
    const isAdminUser = adminAccess.isAdmin
    const tokenIat = decodeJwtIat(session.access_token)

    const accountStateResponse = resolveAccountStateResponse({
      req,
      isApi,
      roleState,
      tokenIat,
    })
    if (accountStateResponse) {
      return accountStateResponse
    }

    const canImpersonate = isAdminUser && impersonateRole && impersonateUser
    const preferredOrgRole = roleState.preferredOrgRole
    const requestedPortalRole = isCoach || isCoachApi
      ? 'coach'
      : isAthlete || isAthleteApi
        ? 'athlete'
        : isGuardian
          ? 'guardian'
          : isOrg
            ? preferredOrgRole
            : null
    const role = resolveEffectiveSessionRole({
      roleState,
      requestedPortalRole,
      impersonateRole,
      canImpersonate: Boolean(canImpersonate),
    })
    const isPlatformAdmin = isAdminUser && !canImpersonate
    const lifecycleResponse = await resolveLifecycleEnforcementResponse({
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

    const billingResponse = await resolveBillingEnforcementResponse({
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
    if (isAthleteApi && role !== 'athlete' && !isAdminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (isCoach && role !== 'coach') {
      return NextResponse.redirect(new URL(roleToPath(role || baseRole), req.url))
    }
    if (isAthlete && role !== 'athlete') {
      return NextResponse.redirect(new URL(roleToPath(role || baseRole), req.url))
    }
    if (isGuardian && role !== 'guardian' && !isPlatformAdmin) {
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
  matcher: ['/coach/:path*', '/athlete/:path*', '/admin/:path*', '/org/:path*', '/guardian/:path*', '/select-plan/:path*', '/checkout/:path*', '/api/:path*'],
}
