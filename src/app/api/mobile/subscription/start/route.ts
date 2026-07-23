import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { createMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { resolvePlatformActor } from '@/lib/platformSubscription'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const actor = await resolvePlatformActor(user.id)
  if (!actor) return jsonError('Athlete, coach, or organization account required', 403)

  const { token, claims } = createMobileCheckoutToken({
    type: 'onboarding', userId: user.id, role: actor.role,
  }, 10 * 60)
  const expiresAt = new Date(claims.expiresAt * 1000).toISOString()
  const { error } = await supabaseAdmin.from('mobile_checkout_handoffs').insert({
    nonce: claims.nonce,
    user_id: user.id,
    checkout_type: 'onboarding',
    token_expires_at: expiresAt,
    expires_at: expiresAt,
    status: 'issued',
    metadata: { role: actor.role, organization_id: actor.organizationId },
  })
  if (error) return jsonError('Unable to create subscription handoff', 500)

  return NextResponse.json({ checkout_url: `${resolveBaseUrl()}/onboarding/checkout?token=${encodeURIComponent(token)}` })
}
