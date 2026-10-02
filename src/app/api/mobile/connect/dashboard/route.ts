import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { loadStripeConnectAccountStatus, type StripeConnectOwnerType } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { authorizeWorkspaceRequest, logWorkspaceAuthority, workspaceCan } from '@/lib/workspaceAuthority'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const responseError = (message: string, status: number, code: string, requestId: string, retryable = status >= 500) =>
  NextResponse.json(
    { error: { code, message, retryable, request_id: requestId } },
    { status, headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } },
  )

const requestIdFor = (request: Request) => {
  const supplied = request.headers.get('x-request-id')?.trim()
  return supplied && /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : randomUUID()
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return responseError('Unauthorized', 401, 'unauthorized', requestId, false)

  let workspaceId: string | null = null
  let organizationId: string | null = null
  let ownerType: StripeConnectOwnerType | null = null
  let ownerId: string | null = null

  try {
    const allowed = await enforcePaymentRateLimit(user.id, 'connect_dashboard', 8, 300)
    if (!allowed) return responseError('Too many dashboard requests. Please try again later.', 429, 'rate_limited', requestId, true)

    const body = await request.json().catch(() => ({}))
    const authority = await authorizeWorkspaceRequest({ request, userId: user.id, body })
    logWorkspaceAuthority({ requestId, userId: user.id, request, route: 'POST /api/mobile/connect/dashboard', body, result: authority })
    if (!authority.ok) return responseError('The selected workspace could not be authorized.', authority.status, authority.code, requestId, false)

    const workspace = authority.workspace
    workspaceId = workspace.id
    organizationId = workspace.organizationId

    if (workspace.type === 'organization' && workspace.organizationId) {
      if (!workspaceCan(workspace, 'manage_connect') && !workspaceCan(workspace, 'manage_payments')) {
        return responseError('Organization payment administration permission required.', 403, 'forbidden', requestId, false)
      }
      ownerType = 'org'
      ownerId = workspace.organizationId
    } else if (workspace.type === 'league' && workspace.leagueId) {
      if (!workspaceCan(workspace, 'manage_payments')) {
        return responseError('League payment administration permission required.', 403, 'forbidden', requestId, false)
      }
      ownerType = 'league'
      ownerId = workspace.leagueId
    } else if (workspace.type === 'independent_coach' && workspace.ownerUserId === user.id) {
      ownerType = 'coach'
      ownerId = user.id
    } else {
      return responseError('A supported payout workspace is required.', 403, 'forbidden', requestId, false)
    }

    const account = await loadStripeConnectAccountStatus(ownerType, ownerId, { refresh: true })
    if (!account?.stripeAccountId) {
      return responseError('Finish setting up Stripe before opening the dashboard.', 409, 'stripe_connect_not_configured', requestId, false)
    }

    const deploymentIsLive = String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')
    if (Boolean(account.livemode) !== deploymentIsLive) {
      return responseError('The payout account is not available in this environment.', 409, 'stripe_environment_mismatch', requestId, false)
    }

    const loginLink = await stripe.accounts.createLoginLink(account.stripeAccountId)
    const dashboardUrl = assertStripeHostedUrl(loginLink.url)

    await auditPaymentAction({
      actorUserId: user.id,
      workspaceId,
      organizationId,
      action: 'connect_dashboard_link_created',
      targetType: 'stripe_connect_account',
      targetId: account.stripeAccountId,
      stripeObjectId: account.stripeAccountId,
      result: 'succeeded',
      correlationId: requestId,
      metadata: { owner_type: ownerType },
    })

    return NextResponse.json(
      { dashboard_url: dashboardUrl },
      { headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } },
    )
  } catch (error) {
    safePaymentError('[mobile/connect/dashboard] failed', error, {
      request_id: requestId,
      user_id: user.id,
      workspace_id: workspaceId,
      owner_type: ownerType,
      owner_id: ownerId,
    })
    await auditPaymentAction({
      actorUserId: user.id,
      workspaceId,
      organizationId,
      action: 'connect_dashboard_link_created',
      targetType: 'stripe_connect_account',
      targetId: ownerId,
      result: 'failed',
      correlationId: requestId,
      metadata: { owner_type: ownerType },
    })
    return responseError('We could not open the Stripe Dashboard. Please try again.', 502, 'stripe_dashboard_unavailable', requestId, true)
  }
}
