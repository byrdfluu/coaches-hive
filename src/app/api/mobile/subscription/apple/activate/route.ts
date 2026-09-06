import { NextResponse } from 'next/server'
import {
  persistAppleSubscription,
  type ApplePlanKey,
  validateAppleActivation,
  validateAppleRenewalState,
  verifyAppleTransaction,
  verifyAppleRenewalInfo,
} from '@/lib/appleIap'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { resolvePlatformActor } from '@/lib/platformSubscription'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PLAN_KEYS = new Set<ApplePlanKey>(['coach_all_access', 'family_all_access'])

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const planKey = typeof body?.plan_key === 'string' ? body.plan_key.trim() : ''
  const signedTransaction = typeof body?.signed_transaction === 'string'
    ? body.signed_transaction.trim()
    : ''
  const signedRenewalInfo = typeof body?.signed_renewal_info === 'string'
    ? body.signed_renewal_info.trim()
    : ''
  if (!VALID_PLAN_KEYS.has(planKey as ApplePlanKey)) return jsonError('Unsupported plan_key', 400)
  if (!signedTransaction) return jsonError('signed_transaction is required', 400)
  if (!signedRenewalInfo) return jsonError('signed_renewal_info is required', 400)

  const actor = await resolvePlatformActor(user.id)
  if (!actor) return jsonError('Athlete or independent coach account required', 403)
  if (actor.role === 'org') return jsonError('Organization subscriptions are Stripe-only', 403)

  try {
    const verified = await verifyAppleTransaction(signedTransaction)
    const renewal = await verifyAppleRenewalInfo(signedRenewalInfo, verified.environment)
    const renewalState = validateAppleRenewalState(verified.payload, renewal)
    await validateAppleActivation({
      transaction: verified.payload,
      verifiedEnvironment: verified.environment,
      userId: user.id,
      actorRole: actor.role,
      planKey: planKey as ApplePlanKey,
    })
    const persisted = await persistAppleSubscription({
      userId: user.id,
      transaction: verified.payload,
      renewal,
      status: 'active',
    })

    return NextResponse.json({
      activated: true,
      purchase_channel: 'apple_iap',
      plan_key: persisted.definition.planKey,
      billing_interval: persisted.definition.interval,
      expires_at: persisted.expiresAt,
      auto_renew_enabled: renewalState.autoRenewEnabled,
      in_billing_retry: renewalState.inBillingRetry,
    })
  } catch (error) {
    console.error('[apple/activate] verification failed', error)
    return jsonError('Unable to verify App Store subscription', 400)
  }
}
