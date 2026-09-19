import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { roleToPath } from '@/lib/roleRedirect'
import {
  cancelStripeSubscriptionsForActor,
  getOrgIdForUser,
  getStripeCustomerIdForUser,
  markSubscriptionCancellationScheduled,
  resolveBillingRole,
} from '@/lib/subscriptionLifecycle'
import { getPostHogClient } from '@/lib/posthog-server'
import { auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const { session, role, error } = await getSessionRole([
    'coach',
    'athlete',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error
  if (!(await enforcePaymentRateLimit(session.user.id, 'subscription_cancel', 5, 300).catch(() => false))) return jsonError('Too many subscription requests. Try again later.', 429)

  const billingRole = resolveBillingRole(role)
  if (!billingRole) return jsonError('Unsupported role for subscription cancellation', 400)

  try {
    const userId = session.user.id
    const orgId = billingRole === 'org' ? await getOrgIdForUser(userId) : null
    const customerId = await getStripeCustomerIdForUser(userId)

    const cancellationResult = await cancelStripeSubscriptionsForActor({
      userId,
      billingRole,
      orgId,
      customerId,
      atPeriodEnd: true,
    })

    await markSubscriptionCancellationScheduled({
      userId,
      metadata: (session.user.user_metadata || {}) as Record<string, unknown>,
      subscriptionStatus: cancellationResult.status || null,
      currentPeriodEnd: cancellationResult.currentPeriodEnd,
    })
    await auditPaymentAction({ actorUserId: userId, organizationId: orgId, action: 'subscription_cancellation_scheduled',
      targetType: 'platform_subscription', targetId: cancellationResult.affectedIds[0] || customerId,
      stripeObjectId: cancellationResult.affectedIds[0] || null, result: 'succeeded' })

    getPostHogClient().capture({
      event: 'Subscription Cancellation Requested',
      distinctId: billingRole === 'org' && orgId ? `org:${orgId}` : userId,
      properties: {
        billing_role: billingRole,
        user_id: userId,
        org_id: orgId,
      },
    })

    return NextResponse.json({
      ok: true,
      dashboardPath: roleToPath(role),
      current_period_end: cancellationResult.currentPeriodEnd,
      cancel_at_period_end: cancellationResult.cancelAtPeriodEnd,
    })
  } catch (caughtError) {
    safePaymentError('[subscription/cancel] failed', caughtError, { user_id: session.user.id })
    return jsonError('Unable to cancel subscription', 500)
  }
}
