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
import { trackMixpanelServerEvent } from '@/lib/mixpanelServer'

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

    await trackMixpanelServerEvent({
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
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to cancel subscription'
    return jsonError(message, 500)
  }
}
