import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { roleToPath } from '@/lib/roleRedirect'
import { hasAdminPermission } from '@/lib/adminRoles'
import {
  isBillingAccessActive,
  resolveBillingRole,
  resolveDbBillingInfoForActor,
} from '@/lib/billingState'
import {
  getActiveTierForUser,
  normalizeRoleForLifecycle,
  resolveLifecycleNextPath,
  resolveLifecycleStateForSession,
} from '@/lib/lifecycleOrchestration'
import { getAdminPermissionForPath, getOrgPermissionKeyForPath, matchesPathPrefix } from '@/lib/middlewarePolicy'
import type { SessionRoleState } from '@/lib/sessionRoleState'
import { ORG_ROLE_SET } from '@/lib/sessionRoleState'

const CANCELED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'cancelled'])
const PAST_DUE_STATUSES = new Set(['past_due'])

const LIFECYCLE_ALLOWED_API_PREFIXES = [
  '/api/lifecycle',
  '/api/roles/active',
  '/api/stripe/subscription/checkout',
  '/api/stripe/subscription/confirm',
  '/api/org/invites',
  '/api/org/create',
  '/api/org/onboarding',
]

const ORG_PERMISSION_ADMIN_ROLES = new Set([
  'admin',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const decodeJwtPayload = (token?: string | null): Record<string, any> | null => {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

const hasMfaAssertion = (token?: string | null) => {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== 'object') return false
  if (payload.aal === 'aal2') return true
  if (Array.isArray(payload.amr)) {
    return payload.amr.some((method) => {
      const normalized = String(method || '').toLowerCase()
      return normalized.includes('mfa') || normalized.includes('totp') || normalized.includes('otp')
    })
  }
  return false
}

const toIpv4Int = (value: string) => {
  const parts = value.split('.').map((segment) => Number(segment))
  if (parts.length !== 4 || parts.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)) {
    return null
  }
  return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

const isIpv4InCidr = (ip: string, cidr: string) => {
  const [networkIp, maskRaw] = cidr.split('/')
  const mask = Number(maskRaw)
  if (!networkIp || !Number.isInteger(mask) || mask < 0 || mask > 32) return false
  const ipInt = toIpv4Int(ip)
  const networkInt = toIpv4Int(networkIp)
  if (ipInt === null || networkInt === null) return false
  if (mask === 0) return true
  const bitMask = (0xffffffff << (32 - mask)) >>> 0
  return (ipInt & bitMask) === (networkInt & bitMask)
}

const isIpAllowed = (ip: string, allowlistRaw: string) => {
  const rules = allowlistRaw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (rules.length === 0) return true
  return rules.some((rule) => {
    if (rule === '*') return true
    if (rule.includes('/')) return isIpv4InCidr(ip, rule)
    return ip === rule
  })
}

const resolvePersistedBillingStatus = async ({
  supabase,
  userId,
  role,
}: {
  supabase: any
  userId: string
  role?: string | null
}) => {
  if (role === 'coach' || role === 'athlete') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', userId)
      .maybeSingle()
    return String(profile?.subscription_status || '').trim().toLowerCase() || null
  }

  if (role && ORG_ROLE_SET.has(role)) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!membership?.org_id) return null

    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('plan_status')
      .eq('org_id', membership.org_id)
      .maybeSingle()

    return String(orgSettings?.plan_status || '').trim().toLowerCase() || null
  }

  return null
}

export const resolveAccountStateResponse = ({
  req,
  isApi,
  roleState,
  tokenIat,
}: {
  req: NextRequest
  isApi: boolean
  roleState: SessionRoleState
  tokenIat: number | null
}) => {
  const forceLogoutAt = roleState.forceLogoutAfter ? new Date(roleState.forceLogoutAfter).getTime() : 0

  if (roleState.suspended) {
    if (isApi) return NextResponse.json({ error: 'Account suspended.' }, { status: 403 })
    return NextResponse.redirect(new URL('/login?error=Account%20suspended', req.url))
  }
  if (roleState.suspiciousLogin) {
    if (isApi) return NextResponse.json({ error: 'Account flagged for suspicious login.' }, { status: 403 })
    return NextResponse.redirect(new URL('/login?error=Suspicious%20login%20detected.%20Please%20reset%20password.', req.url))
  }
  if (forceLogoutAt && tokenIat && tokenIat * 1000 < forceLogoutAt) {
    if (isApi) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
    return NextResponse.redirect(new URL('/login?error=Session%20expired.%20Please%20log%20in%20again.', req.url))
  }

  return null
}

export const resolveLifecycleEnforcementResponse = async ({
  req,
  pathname,
  isApi,
  isPublicApi,
  role,
  roleState,
  session,
  supabase,
}: {
  req: NextRequest
  pathname: string
  isApi: boolean
  isPublicApi: boolean
  role?: string | null
  roleState: SessionRoleState
  session: { user: { id: string; email_confirmed_at?: string | null; confirmed_at?: string | null } }
  supabase: any
}) => {
  const lifecycleRole = normalizeRoleForLifecycle(role || roleState.baseRole)
  const lifecycleStateRaw = roleState.lifecycleState || ''
  const selectedTier = roleState.selectedTier

  if (!lifecycleStateRaw || (lifecycleRole !== 'coach' && lifecycleRole !== 'athlete' && lifecycleRole !== 'org_admin')) {
    return null
  }

  const lifecycleState = resolveLifecycleStateForSession({
    lifecycleStateHint: lifecycleStateRaw,
    emailConfirmed: Boolean(session.user.email_confirmed_at || session.user.confirmed_at),
  })
  const lifecyclePath = resolveLifecycleNextPath({
    role: lifecycleRole,
    state: lifecycleState,
    selectedTier,
  })
  const enforcePath = lifecycleState !== 'active'
  const isLifecycleAllowedPath =
    (lifecycleState === 'awaiting_verification' && pathname.startsWith('/auth/verify'))
    || (lifecycleState === 'verified_pending_plan' && pathname.startsWith('/select-plan'))
    || (
      (lifecycleState === 'plan_selected' || lifecycleState === 'checkout_in_progress')
      && (
        pathname.startsWith('/checkout')
        || pathname.startsWith('/select-plan')
        || (lifecycleRole === 'org_admin' && (pathname === '/org' || pathname.startsWith('/org/')))
      )
    )
  const isLifecycleAllowedApi = LIFECYCLE_ALLOWED_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))

  if (enforcePath && !isLifecycleAllowedPath && !isApi) {
    const activeTier = await getActiveTierForUser({
      supabase,
      userId: session.user.id,
      role: lifecycleRole,
      selectedTierHint: selectedTier,
      orgIdHint: roleState.currentOrgId,
    })
    if (!activeTier) {
      return NextResponse.redirect(new URL(lifecyclePath, req.url))
    }
  }

  if (enforcePath && isApi && !isPublicApi && !isLifecycleAllowedApi) {
    return NextResponse.json({ error: 'Lifecycle incomplete. Complete onboarding flow first.' }, { status: 409 })
  }

  return null
}

const guardianHasLinkedAthleteBillingAccess = async ({
  supabase,
  guardianUserId,
}: {
  supabase: any
  guardianUserId: string
}) => {
  const [{ data: guardianProfile }, { data: links }] = await Promise.all([
    supabase
      .from('profiles')
      .select('email')
      .eq('id', guardianUserId)
      .maybeSingle(),
    supabase
      .from('guardian_athlete_links')
      .select('athlete_id')
      .eq('guardian_user_id', guardianUserId)
      .eq('status', 'active'),
  ])

  const athleteIds = new Set<string>()
  ;(links || []).forEach((row: { athlete_id?: string | null }) => {
    const athleteId = String(row.athlete_id || '').trim()
    if (athleteId) athleteIds.add(athleteId)
  })

  const guardianEmail = String(guardianProfile?.email || '').trim().toLowerCase()
  if (guardianEmail) {
    const { data: emailMatchedAthletes } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'athlete')
      .ilike('guardian_email', guardianEmail)

    ;(emailMatchedAthletes || []).forEach((row: { id?: string | null }) => {
      const athleteId = String(row.id || '').trim()
      if (athleteId) athleteIds.add(athleteId)
    })
  }

  if (athleteIds.size === 0) return false

  const athleteIdList = Array.from(athleteIds)
  const [{ data: profiles }, { data: planRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, subscription_status, plan_tier')
      .in('id', athleteIdList),
    supabase
      .from('athlete_plans')
      .select('athlete_id, tier')
      .in('athlete_id', athleteIdList),
  ])

  const planMap = new Map(
    ((planRows || []) as Array<{ athlete_id: string; tier?: string | null }>).map((row) => [
      row.athlete_id,
      String(row.tier || '').trim() || null,
    ]),
  )

  return (profiles || []).some((profile: { id: string; subscription_status?: string | null; plan_tier?: string | null }) => {
    const status = String(profile.subscription_status || '').trim().toLowerCase()
    const tier = String(planMap.get(profile.id) || profile.plan_tier || '').trim()
    return isBillingAccessActive(status) && Boolean(tier)
  })
}

export const resolveBillingEnforcementResponse = async ({
  req,
  pathname,
  isApi,
  role,
  roleState,
  userId,
  supabase,
  isBillingRecoveryPage,
  isBillingRecoveryApi,
}: {
  req: NextRequest
  pathname: string
  isApi: boolean
  role?: string | null
  roleState: SessionRoleState
  userId: string
  supabase: any
  isBillingRecoveryPage: boolean
  isBillingRecoveryApi: boolean
}) => {
  if (role === 'guardian') {
    const hasLinkedBillingAccess = await guardianHasLinkedAthleteBillingAccess({
      supabase,
      guardianUserId: userId,
    })
    if (hasLinkedBillingAccess) return null

    if (isApi) {
      return NextResponse.json(
        { error: 'A linked athlete needs an active subscription before this guardian portal can be used.' },
        { status: 402 },
      )
    }

    return NextResponse.redirect(
      new URL('/login?error=Linked%20athlete%20subscription%20required&role=guardian', req.url),
    )
  }

  const hasBillingSubscription =
    role === 'coach'
    || role === 'athlete'
    || ORG_ROLE_SET.has(String(role || ''))

  if (!hasBillingSubscription) return null

  let subscriptionStatus = roleState.subscriptionStatus || ''
  let activeTier: string | null = null
  const normalizedRole = String(role || roleState.baseRole || '')
  const billingRole = resolveBillingRole(normalizedRole)
  const needsBillingRefresh =
    !subscriptionStatus
    || CANCELED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
    || PAST_DUE_STATUSES.has(subscriptionStatus)

  if (needsBillingRefresh && billingRole) {
    const billingInfo = await resolveDbBillingInfoForActor({
      userId,
      billingRole,
      selectedTierHint: roleState.selectedTier,
      orgIdHint: roleState.currentOrgId,
    })
    if (billingInfo.status) {
      subscriptionStatus = String(billingInfo.status || '').trim().toLowerCase() || subscriptionStatus
    } else {
      const persistedBillingStatus = await resolvePersistedBillingStatus({
        supabase,
        userId,
        role: normalizedRole,
      })
      if (persistedBillingStatus) {
        subscriptionStatus = persistedBillingStatus
      }
    }
    activeTier = billingInfo.tier || null
  } else if (billingRole) {
    activeTier = await getActiveTierForUser({
      supabase,
      userId: userId,
      role: normalizedRole,
      selectedTierHint: roleState.selectedTier,
      orgIdHint: roleState.currentOrgId,
    })
  }

  const dashboardPath = roleToPath(role || roleState.baseRole)
  const recoveryRole = String(role || roleState.baseRole || '')
  const recoveryTier = String(roleState.selectedTier || '').trim()
  const billingRecoveryPath = `/select-plan?role=${encodeURIComponent(recoveryRole)}${recoveryTier ? `&tier=${encodeURIComponent(recoveryTier)}` : ''}&billing=canceled`

  if ((!isBillingAccessActive(subscriptionStatus) || !activeTier) && !isBillingRecoveryPage) {
    if (isApi && !isBillingRecoveryApi) {
      return NextResponse.json(
        { error: 'An active subscription is required to access this area.' },
        { status: 402 },
      )
    }

    if (!isApi) {
      const requiredPath = `/select-plan?role=${encodeURIComponent(recoveryRole)}${recoveryTier ? `&tier=${encodeURIComponent(recoveryTier)}` : ''}&billing=required`
      return NextResponse.redirect(new URL(requiredPath, req.url))
    }
  }

  if (CANCELED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    if (isApi && !isBillingRecoveryApi) {
      return NextResponse.json(
        { error: 'Subscription canceled. Reactivate billing to continue.' },
        { status: 402 },
      )
    }
    if (!isApi && !isBillingRecoveryPage) {
      return NextResponse.redirect(new URL(billingRecoveryPath, req.url))
    }
  }

  if (PAST_DUE_STATUSES.has(subscriptionStatus)) {
    if (!isApi && pathname === dashboardPath) {
      const url = new URL(req.url)
      if (!url.searchParams.has('billing')) {
        url.searchParams.set('billing', 'past_due')
        return NextResponse.redirect(url)
      }
    }
  }

  return null
}

export const resolveAdminAccessEnforcementResponse = async ({
  req,
  pathname,
  method,
  isApi,
  isAdminRoute,
  isAdminApi,
  isAdminUser,
  adminAccess,
  session,
  supabase,
}: {
  req: NextRequest
  pathname: string
  method: string
  isApi: boolean
  isAdminRoute: boolean
  isAdminApi: boolean
  isAdminUser: boolean
  adminAccess: SessionRoleState['adminAccess']
  session: { user: { app_metadata?: Record<string, unknown> | null }; access_token?: string | null }
  supabase: any
}) => {
  if ((isAdminRoute || isAdminApi) && isAdminUser && adminAccess.teamRole) {
    const teamRole = adminAccess.teamRole
    const requiredPermission = getAdminPermissionForPath(pathname, method)
    if (requiredPermission && !hasAdminPermission(teamRole, requiredPermission)) {
      if (isApi) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.redirect(new URL('/admin', req.url))
    }

    const { data: securityConfigRow, error: securityConfigError } = await supabase
      .from('admin_configs')
      .select('data')
      .eq('key', 'security')
      .maybeSingle()

    if (securityConfigError) {
      console.error('[middleware] admin_configs query failed — blocking admin access', securityConfigError)
      if (isApi) return NextResponse.json({ error: 'Security configuration unavailable' }, { status: 503 })
      return NextResponse.redirect(new URL('/login?error=Admin+access+temporarily+unavailable', req.url))
    }

    const securityConfig = (securityConfigRow?.data || {}) as Record<string, any>
    const requiresSso = Boolean(securityConfig.require_sso)
    const disablePassword = Boolean(securityConfig.disable_password)
    const enforceMfa = Boolean(securityConfig.enforce_mfa)
    const ipAllowlist = String(securityConfig.ip_allowlist || '')

    const appMetadata = (session.user.app_metadata || {}) as Record<string, any>
    const providers = Array.isArray(appMetadata.providers)
      ? appMetadata.providers.map((value) => String(value || '').toLowerCase())
      : []
    const provider = String(appMetadata.provider || '').toLowerCase()
    const allProviders = [provider, ...providers].filter(Boolean)
    const usesSso = allProviders.includes('sso')
    const usesPassword = allProviders.includes('email') || allProviders.includes('password')

    if (requiresSso && !usesSso) {
      if (isApi) return NextResponse.json({ error: 'SSO is required for admin access.' }, { status: 403 })
      return NextResponse.redirect(new URL('/login?error=SSO%20required%20for%20admin%20access.', req.url))
    }
    if (disablePassword && usesPassword) {
      if (isApi) return NextResponse.json({ error: 'Password-based admin login is disabled.' }, { status: 403 })
      return NextResponse.redirect(new URL('/login?error=Password%20login%20disabled%20for%20admin%20access.', req.url))
    }
    if (enforceMfa && !hasMfaAssertion(session.access_token)) {
      if (isApi) return NextResponse.json({ error: 'MFA is required for admin access.' }, { status: 403 })
      return NextResponse.redirect(new URL('/login?error=MFA%20required%20for%20admin%20access.', req.url))
    }
    if (ipAllowlist.trim()) {
      const forwarded = req.headers.get('x-forwarded-for') || ''
      const ip = forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
      if (!ip || !isIpAllowed(ip, ipAllowlist)) {
        if (isApi) return NextResponse.json({ error: 'Admin access is not allowed from this network.' }, { status: 403 })
        return NextResponse.redirect(new URL('/login?error=Admin%20network%20access%20restricted.', req.url))
      }
    }
  }

  if (isAdminApi && !isAdminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}

export const resolveOrgMembershipEnforcementResponse = async ({
  req,
  pathname,
  role,
  requiresOrgMembershipGuard,
  isPlatformAdmin,
  isOrgOnboardingPage,
  isOrgApi,
  session,
  supabase,
}: {
  req: NextRequest
  pathname: string
  role?: string | null
  requiresOrgMembershipGuard: boolean
  isPlatformAdmin: boolean
  isOrgOnboardingPage: boolean
  isOrgApi: boolean
  session: { user: { id: string } }
  supabase: any
}) => {
  if (!requiresOrgMembershipGuard) return null

  if (role === 'athlete') {
    if (isOrgApi) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/athlete', req.url))
  }

  if (isPlatformAdmin) return null

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id, role, status')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!membership?.org_id) {
    if (isOrgOnboardingPage) return null
    if (isOrgApi) {
      return NextResponse.json({ error: 'No organization membership.' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/org/onboarding', req.url))
  }

  if (membership.status === 'suspended') {
    if (isOrgApi) {
      return NextResponse.json({ error: 'Access suspended.' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/org/suspended', req.url))
  }

  const orgRole = membership.role || ''
  const permissionKey = getOrgPermissionKeyForPath(pathname)

  if (permissionKey && !ORG_PERMISSION_ADMIN_ROLES.has(orgRole)) {
    const { data: rolePermRow } = await supabase
      .from('org_role_permissions')
      .select('permissions')
      .eq('org_id', membership.org_id)
      .eq('role', orgRole)
      .maybeSingle()

    const permissions = (rolePermRow?.permissions || {}) as Record<string, boolean>
    if (Object.keys(permissions).length > 0 && permissions[permissionKey] === false) {
      if (isOrgApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/org', req.url))
    }
  }

  return null
}
