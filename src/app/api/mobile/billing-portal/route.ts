import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { resolveMobileSubscriptionOwner } from '@/lib/mobileSubscriptionAuthority'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingStripeCustomerError } from '@/lib/stripeCustomerErrors'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'
import { normalizeUuid } from '@/lib/uuid'
import { authorizeWorkspaceRequest, logWorkspaceAuthority } from '@/lib/workspaceAuthority'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const RETURN_URL = 'https://app.coacheshive.com/open-app?from=%2Fbilling-updated'
const ORGANIZATION_PORTAL_CONFIGURATION_ID = process.env.STRIPE_ORGANIZATION_SUBSCRIPTION_PORTAL_CONFIGURATION_ID?.trim()

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const fail = (code: string, message: string, status = 400, retryable = status === 429 || status >= 500) =>
    correlatedError(requestId, code, message, status, retryable)
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Authentication is required.', 401, false)
  if (!(await enforcePaymentRateLimit(user.id, 'billing_portal', 5, 60).catch(() => false))) {
    return fail('rate_limited', 'Too many billing portal requests. Try again shortly.', 429, true)
  }
  const body = await request.json().catch(() => ({}))
  const authority = await authorizeWorkspaceRequest({ request, userId: user.id, body })
  logWorkspaceAuthority({ requestId, userId: user.id, request, route: 'POST /api/mobile/billing-portal', body, result: authority })
  if (!authority.ok) return fail(authority.code, 'The selected workspace could not be authorized.', authority.status, false)
  const workspaceId = authority.workspace.id
  const owner = await resolveMobileSubscriptionOwner(user.id, workspaceId)
  if (!owner) return fail('workspace_billing_forbidden', 'You do not have billing permission for this workspace.', 403, false)

  const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('platform_subscriptions')
    .select('id,workspace_id,owner_type,owner_id,stripe_customer_id,stripe_subscription_id,purchase_channel,status')
    .eq('owner_type', owner.ownerType).eq('owner_id', owner.ownerId).maybeSingle()
  if (subscriptionError) {
    safePaymentError('[mobile/billing-portal] subscription lookup failed', subscriptionError, {
      user_id: user.id, workspace_id: workspaceId, owner_type: owner.ownerType,
      owner_id: owner.ownerId, request_id: requestId,
    })
    return fail('billing_portal_unavailable', 'Unable to open subscription management.', 502, true)
  }
  if (!subscription) return fail('subscription_not_found', 'No subscription was found for this workspace.', 404, false)
  if (subscription.workspace_id && normalizeUuid(subscription.workspace_id) !== workspaceId) {
    return fail('subscription_workspace_mismatch', 'The subscription belongs to another workspace.', 409, false)
  }
  if (subscription.purchase_channel === 'apple_iap') {
    return NextResponse.json({ error: { code: 'apple_managed_subscription',
      message: 'This subscription is managed through Apple.', retryable: false,
      purchase_channel: 'apple_iap', request_id: requestId } },
    { status: 409, headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
  }
  if (!subscription.stripe_customer_id) return fail('stripe_customer_not_attached', 'No Stripe billing customer is attached to this workspace subscription.', 409, false)

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: RETURN_URL,
      ...(ORGANIZATION_PORTAL_CONFIGURATION_ID ? { configuration: ORGANIZATION_PORTAL_CONFIGURATION_ID } : {}),
    })
    await auditPaymentAction({ actorUserId: user.id, workspaceId, organizationId: owner.organizationId,
      action: 'billing_portal_created', targetType: 'platform_subscription', targetId: subscription.id,
      stripeObjectId: session.id, result: 'succeeded', metadata: { request_id: requestId } })
    return NextResponse.json({ portal_url: assertStripeHostedUrl(session.url),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), request_id: requestId },
    { headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
  } catch (error) {
    if (isMissingStripeCustomerError(error)) return fail('stripe_customer_deleted', 'The Stripe billing customer is no longer available. Contact Coaches Hive support.', 409, false)
    safePaymentError('[mobile/billing-portal] failed', error, {
      user_id: user.id, workspace_id: workspaceId, owner_type: owner.ownerType,
      owner_id: owner.ownerId, platform_subscription_id: subscription.id,
      stripe_customer_id: subscription.stripe_customer_id, request_id: requestId,
    })
    return fail('billing_portal_unavailable', 'Unable to open subscription management.', 502, true)
  }
}
