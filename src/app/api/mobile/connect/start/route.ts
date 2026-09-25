import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { createOrReuseStripeConnectAccount } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext, workspaceCan } from '@/lib/workspaceAuthority'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit } from '@/lib/paymentSecurity'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ORG_CONNECT_ROLES = new Set([
  'owner',
  'admin',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
])

const userHasRole = (user: Awaited<ReturnType<typeof getMobileRequestUser>>, role: string) => {
  if (!user) return false
  const metadata = user.user_metadata || {}
  const roles = new Set([
    metadata.role,
    metadata.active_role,
    metadata.current_role,
    ...(Array.isArray(metadata.available_roles) ? metadata.available_roles : []),
  ].filter(Boolean).map(String))
  return roles.has(role)
}

const resolveOrgMembership = async (userId: string, orgId?: string | null) => {
  let query = supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role, status')
    .eq('user_id', userId)
    .in('role', Array.from(ORG_CONNECT_ROLES))

  if (orgId) query = query.eq('org_id', orgId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Unable to verify organization authority: ${error.message}`)

  if (!data?.org_id || !ORG_CONNECT_ROLES.has(String(data.role || ''))) return null
  if (data.status && String(data.status).toLowerCase() !== 'active') return null
  return data
}

const trustedAppReturnUrl = (value: string) => {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'app.coacheshive.com' || url.pathname !== '/open-app') {
    throw new Error('return_url must use https://app.coacheshive.com/open-app')
  }
  const destination = url.searchParams.get('from') || ''
  if (!['connect-updated', '/connect-updated'].includes(destination.split('?')[0])) {
    throw new Error('return_url must target the connect-updated app destination')
  }
  return url.toString()
}

const connectError = (message: string, status: number, requestId: string, code = 'connect_onboarding_failed', retryable = status >= 500) =>
  NextResponse.json({ error: { code, message, retryable, request_id: requestId } }, { status, headers: { 'x-request-id': requestId } })

const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unable to start Stripe Connect onboarding'
  return message.replace(/sk_(?:live|test)_[A-Za-z0-9]+/g, '[redacted]').slice(0, 300)
}

export async function POST(request: Request) {
  const providedRequestId = request.headers.get('x-request-id')?.trim()
  const requestId = providedRequestId && /^[A-Za-z0-9._:-]{8,100}$/.test(providedRequestId) ? providedRequestId : randomUUID()
  try {
  const user = await getMobileRequestUser(request)
  if (!user) return connectError('Unauthorized', 401, requestId, 'unauthorized', false)
  const allowed = await enforcePaymentRateLimit(user.id, 'connect_onboarding', 4, 300)
  if (!allowed) return connectError('Too many onboarding requests. Try again later.', 429, requestId, 'rate_limited', true)

  const body = await request.json().catch(() => null)
  const role = String(body?.role || '').trim()
  const orgId = typeof body?.org_id === 'string' ? body.org_id.trim() || null : null
  const leagueId = typeof body?.league_id === 'string' ? body.league_id.trim() || null : null
  const returnUrl = typeof body?.return_url === 'string' ? body.return_url.trim() : null
  const workspace = await requireWorkspaceContext(user.id, body?.workspace_id)

  if (!['coach', 'org', 'league'].includes(role)) return connectError('role must be coach, org, or league', 400, requestId, 'invalid_request', false)
  if (!returnUrl) return connectError('return_url is required', 400, requestId, 'invalid_request', false)
  const verifiedReturnUrl = trustedAppReturnUrl(returnUrl)

  let ownerType: 'coach' | 'org' | 'league'
  let ownerId: string
  let metadata: Record<string, string>

  if (role === 'coach') {
    if (workspace?.type === 'independent_coach' && workspace.ownerUserId === user.id) {
      ownerType = 'coach'
      ownerId = user.id
      metadata = { owner_type: 'coach', coach_id: user.id, user_id: user.id, workspace_id: workspace.id }
    } else if (workspace?.type === 'organization' && workspace.organizationId) {
      if (!workspaceCan(workspace, 'manage_connect')) return connectError('Organization payout access required', 403, requestId, 'forbidden', false)
      ownerType = 'org'
      ownerId = workspace.organizationId
      metadata = { owner_type: 'org', org_id: ownerId, user_id: user.id, workspace_id: workspace.id }
    } else {
      if (!userHasRole(user, 'coach')) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (String(profile?.role || '') !== 'coach') return connectError('Forbidden', 403, requestId, 'forbidden', false)
      }
      ownerType = 'coach'
      ownerId = user.id
      metadata = { owner_type: 'coach', coach_id: user.id, user_id: user.id }
    }
  } else if (role === 'org') {
    if (workspace && (workspace.type !== 'organization' || (orgId && workspace.organizationId !== orgId))) {
      return connectError('Organization workspace mismatch', 403, requestId, 'forbidden', false)
    }
    const membership = await resolveOrgMembership(user.id, orgId)
    if (!membership?.org_id) return connectError('Organization admin membership required', 403, requestId, 'forbidden', false)
    ownerType = 'org'
    ownerId = membership.org_id
    metadata = { owner_type: 'org', org_id: membership.org_id, user_id: user.id, membership_role: String(membership.role || '') }
  } else if (role === 'league') {
    if (!leagueId) return connectError('league_id is required', 400, requestId, 'invalid_request', false)
    const [leagueResult, membershipResult, workspaceMembershipResult] = await Promise.all([
      supabaseAdmin.from('leagues').select('id,status').eq('id',leagueId).maybeSingle(),
      supabaseAdmin.from('league_memberships').select('id,role,status').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle(),
      supabaseAdmin.from('workspace_memberships').select('permissions,business_workspaces!inner(league_id,workspace_type)')
        .eq('user_id', user.id).eq('status', 'active').eq('business_workspaces.league_id', leagueId).maybeSingle(),
    ])
    if (leagueResult.error || membershipResult.error || workspaceMembershipResult.error) throw new Error('Unable to verify league payment authority')
    const league = leagueResult.data
    const membership = membershipResult.data
    const workspaceMembership = workspaceMembershipResult.data
    if (!league || league.status !== 'active') return connectError('Active league not found', 404, requestId, 'not_found', false)
    const permissions = (workspaceMembership?.permissions || {}) as Record<string, unknown>
    const canManagePayments = membership?.status === 'active' && membership.role === 'league_admin'
      || permissions.manage_payments === true
    if (!canManagePayments) return connectError('League payment administration permission required', 403, requestId, 'forbidden', false)
    ownerType = 'league'
    ownerId = leagueId
    metadata = { owner_type: 'league', league_id: leagueId, user_id: user.id, membership_role: String(membership?.role || '') }
  } else {
    return connectError('Unsupported Stripe Connect owner', 400, requestId, 'invalid_request', false)
  }

    const accountStatus = await createOrReuseStripeConnectAccount(ownerType, ownerId, metadata)
    if (workspace?.id) {
      await supabaseAdmin.from('stripe_connect_accounts').update({ workspace_id: workspace.id })
        .eq('owner_type', ownerType).eq('owner_id', ownerId)
    }
    const refreshUrl = new URL('https://app.coacheshive.com/open-app')
    refreshUrl.searchParams.set('from', '/connect-updated?stripe=refresh')

    const accountLink = await stripe.accountLinks.create({
      account: accountStatus.stripeAccountId,
      refresh_url: refreshUrl.toString(),
      return_url: verifiedReturnUrl,
      type: 'account_onboarding',
      collection_options: { fields: 'currently_due', future_requirements: 'omit' },
    })

    await auditPaymentAction({ actorUserId: user.id, workspaceId: workspace?.id || null, organizationId: workspace?.organizationId || null,
      action: 'connect_onboarding_created', targetType: 'stripe_connect_account', targetId: accountStatus.stripeAccountId,
      stripeObjectId: accountStatus.stripeAccountId, result: 'succeeded' })
    return NextResponse.json({ onboarding_url: assertStripeHostedUrl(accountLink.url), stripe_account_id: accountStatus.stripeAccountId,
      owner_type: ownerType, owner_id: ownerId, request_id: requestId }, { headers: { 'x-request-id': requestId } })
  } catch (error: unknown) {
    const message = safeErrorMessage(error)
    console.error('[mobile/connect/start]', { request_id: requestId, message })
    const invalid = /return_url|role must|is required/i.test(message)
    return connectError(message, invalid ? 400 : 500, requestId, invalid ? 'invalid_request' : 'connect_onboarding_failed', !invalid)
  }
}
