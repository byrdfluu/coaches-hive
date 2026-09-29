import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { createOrReuseStripeConnectAccount } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeWorkspaceRequest, logWorkspaceAuthority, workspaceCan } from '@/lib/workspaceAuthority'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit } from '@/lib/paymentSecurity'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const trustedAppReturnUrl = (value: string) => {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'app.coacheshive.com' || url.pathname !== '/open-app') {
    throw new Error('return_url must use https://app.coacheshive.com/open-app')
  }
  // The web API owns the post-onboarding destination. Mobile clients only need
  // to supply the trusted HTTPS universal-link wrapper; normalizing here keeps
  // older app builds working and prevents arbitrary redirect destinations.
  url.search = ''
  url.searchParams.set('from', '/connect-updated?stripe=success')
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
  const returnUrl = typeof body?.return_url === 'string' ? body.return_url.trim() : null
  const authority = await authorizeWorkspaceRequest({ request, userId: user.id, body })
  logWorkspaceAuthority({ requestId, userId: user.id, request, route: 'POST /api/mobile/connect/start', body, result: authority })
  if (!authority.ok) return connectError('The selected workspace could not be authorized.', authority.status, requestId, authority.code, false)
  const workspace = authority.workspace

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
      return connectError('Independent coach workspace access required', 403, requestId, 'forbidden', false)
    }
  } else if (role === 'org') {
    if (workspace.type !== 'organization' || !workspace.organizationId) {
      return connectError('Organization workspace mismatch', 403, requestId, 'forbidden', false)
    }
    if (!workspaceCan(workspace, 'manage_connect') && !workspaceCan(workspace, 'manage_payments')) {
      return connectError('Organization payment administration permission required', 403, requestId, 'forbidden', false)
    }
    ownerType = 'org'
    ownerId = workspace.organizationId
    metadata = { owner_type: 'org', org_id: ownerId, user_id: user.id, workspace_id: workspace.id }
  } else if (role === 'league') {
    if (workspace.type !== 'league' || !workspace.leagueId) return connectError('League workspace mismatch', 403, requestId, 'forbidden', false)
    if (!workspaceCan(workspace, 'manage_payments')) return connectError('League payment administration permission required', 403, requestId, 'forbidden', false)
    ownerType = 'league'
    ownerId = workspace.leagueId
    metadata = { owner_type: 'league', league_id: ownerId, user_id: user.id, workspace_id: workspace.id }
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
