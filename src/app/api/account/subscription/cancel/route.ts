import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { roleToPath } from '@/lib/roleRedirect'
import {
  cancelStripeSubscriptionsForActor,
  getOrgIdForUser,
  getStripeCustomerIdForUser,
  markSubscriptionCanceled,
  resolveBillingRole,
} from '@/lib/subscriptionLifecycle'

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

    await cancelStripeSubscriptionsForActor({
      userId,
      billingRole,
      orgId,
      customerId,
    })

    await markSubscriptionCanceled({
      userId,
      orgId,
      metadata: (session.user.user_metadata || {}) as Record<string, unknown>,
    })

    return NextResponse.json({
      ok: true,
      dashboardPath: roleToPath(role),
    })
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to cancel subscription'
    return jsonError(message, 500)
  }
}
