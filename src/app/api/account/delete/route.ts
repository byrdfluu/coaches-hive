import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  cancelStripeSubscriptionsForActor,
  getOrgIdForUser,
  getStripeCustomerIdForUser,
  resolveBillingRole,
} from '@/lib/subscriptionLifecycle'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const { session, role, error } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const userId = session.user.id
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
