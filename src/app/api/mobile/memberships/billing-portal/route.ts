import { NextResponse } from 'next/server'
import { CoachMembershipPortalError, createCoachMembershipBillingPortal } from '@/lib/coachMembershipBillingPortal'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { parseUuid } from '@/lib/uuid'
import { mobileContractError } from '@/lib/mobileApiContract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const errorResponse = (code: string, message: string, status: number) =>
  mobileContractError(code, message, status, status === 429 || status >= 500)

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return errorResponse('unauthorized', 'Unauthorized.', 401)

  const body = await request.json().catch(() => ({}))
  const subscriptionId = parseUuid(body.subscription_id)
  if (!subscriptionId) return errorResponse('invalid_subscription_id', 'A valid subscription_id is required.', 422)

  try {
    return NextResponse.json(await createCoachMembershipBillingPortal({
      authenticatedUserId: user.id,
      subscriptionId,
      requestedWorkspaceId: request.headers.get('x-workspace-id'),
    }))
  } catch (error) {
    if (error instanceof CoachMembershipPortalError) return errorResponse(error.code, error.message, error.status)
    console.error('[memberships/billing-portal] unexpected failure', { subscription_id: subscriptionId, error })
    return errorResponse('billing_portal_unavailable', 'Unable to open membership billing management.', 500)
  }
}
