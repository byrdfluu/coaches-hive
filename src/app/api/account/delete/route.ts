import { NextResponse } from 'next/server'
import { jsonError, commonRoles } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  cancelStripeSubscriptionsForActor,
  getOrgIdForUser,
  getStripeCustomerIdForUser,
  resolveBillingRole,
} from '@/lib/subscriptionLifecycle'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const roleState = getSessionRoleState(user.user_metadata)
  const roleCandidates = Array.from(new Set([
    roleState.currentRole,
    roleState.activeRole,
    roleState.preferredOrgRole,
    ...roleState.availableRoles,
  ].filter(Boolean))) as string[]
  const role = roleCandidates.find((candidate) => commonRoles.includes(candidate)) || null
  if (!role) return jsonError('Forbidden', 403)

  const userId = user.id
  const billingRole = resolveBillingRole(role)

  try {
    if (billingRole) {
      const orgId = billingRole === 'org' ? await getOrgIdForUser(userId) : null
      const customerId = await getStripeCustomerIdForUser(userId)

      await cancelStripeSubscriptionsForActor({
        userId,
        billingRole,
        orgId,
        customerId,
      })
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      return jsonError(deleteError.message, 500)
    }

    return NextResponse.json({ ok: true })
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to delete account'
    return jsonError(message, 500)
  }
}
