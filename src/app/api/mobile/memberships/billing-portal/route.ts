import { NextResponse } from 'next/server'
import { CoachMembershipPortalError, createCoachMembershipBillingPortal } from '@/lib/coachMembershipBillingPortal'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, retryable: status === 429 || status >= 500 } }, { status })

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return errorResponse('unauthorized', 'Unauthorized.', 401)

  const body = await request.json().catch(() => ({}))
  const subscriptionId = String(body.subscription_id || '').trim()
  if (!subscriptionId) return errorResponse('subscription_id_required', 'subscription_id is required.', 422)

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
