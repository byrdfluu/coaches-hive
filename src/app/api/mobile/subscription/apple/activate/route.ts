import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { resolvePlatformActor } from '@/lib/platformSubscription'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Called by the iOS app after StoreKit confirms a successful IAP transaction.
// Activates the subscription in platform_subscriptions with purchase_channel = 'apple_iap'.
export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  if (!body) return jsonError('Request body required', 400)

  const transactionId = typeof body.transaction_id === 'string' ? body.transaction_id.trim() : null
  const productId = typeof body.product_id === 'string' ? body.product_id.trim() : null
  const expiresAt = typeof body.expires_at === 'string' ? body.expires_at.trim() : null
  const billingInterval = String(body.billing_interval || 'month') === 'year' ? 'year' : 'month'

  if (!transactionId) return jsonError('transaction_id is required', 400)
  if (!productId) return jsonError('product_id is required', 400)

  const actor = await resolvePlatformActor(user.id)
  if (!actor) return jsonError('Athlete, coach, or organization account required', 403)

  const ownerId = actor.role === 'org' ? actor.organizationId : actor.userId
  if (!ownerId) return jsonError('Unable to resolve billing owner', 403)

  const tier = actor.role === 'athlete' ? 'family_all_access'
    : actor.role === 'coach' ? 'coach_all_access'
    : 'org_all_access'

  const { error } = await supabaseAdmin.from('platform_subscriptions').upsert({
    owner_type: actor.role,
    owner_id: ownerId,
    user_id: user.id,
    organization_id: actor.organizationId,
    tier,
    status: 'active',
    billing_interval: billingInterval,
    current_period_end: expiresAt || null,
    cancel_at_period_end: false,
    purchase_channel: 'apple_iap',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_type,owner_id' })

  if (error) return jsonError('Failed to activate subscription', 500)

  return NextResponse.json({ activated: true, purchase_channel: 'apple_iap', tier })
}
