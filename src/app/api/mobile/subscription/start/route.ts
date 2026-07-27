import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { createMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { consumeMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import {
  getAllAccessPriceKeys,
  normalizeBillingInterval,
  resolveFirstConfiguredPrice,
} from '@/lib/allAccessPricing'
import { resolvePlatformActor } from '@/lib/platformSubscription'
import { resolveBaseUrl } from '@/lib/siteUrl'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const actor = await resolvePlatformActor(user.id)
  if (!actor) return jsonError('Athlete, coach, or organization account required', 403)
  if (actor.role === 'org' && !actor.canViewOrgBilling) {
    return jsonError('Organization billing access required', 403)
  }

  const body = await request.json().catch(() => null)
  if (body?.billing_interval !== 'month' && body?.billing_interval !== 'year') {
    return jsonError('billing_interval must be month or year', 400)
  }
  const billingInterval = normalizeBillingInterval(body?.billing_interval)

  const priceKeys = getAllAccessPriceKeys(
    actor.role === 'org' ? 'org' : actor.role,
    billingInterval,
  )
  const { priceId, keysTried } = resolveFirstConfiguredPrice(priceKeys)
  if (!priceId) {
    return jsonError(`Stripe price not configured. Set ${keysTried.join(' or ')} in environment.`, 500)
  }

  // Token lifetime matches Stripe's default checkout session lifetime (24 h).
  const TOKEN_LIFETIME = 24 * 60 * 60
  const { token, claims } = createMobileCheckoutToken(
    { type: 'onboarding', userId: user.id, role: actor.role },
    TOKEN_LIFETIME,
  )
  const expiresAt = new Date(claims.expiresAt * 1000).toISOString()

  const { error: handoffError } = await supabaseAdmin.from('mobile_checkout_handoffs').insert({
    nonce: claims.nonce,
    user_id: user.id,
    checkout_type: 'onboarding',
    token_expires_at: expiresAt,
    expires_at: expiresAt,
    status: 'issued',
    metadata: {
      role: actor.role,
      organization_id: actor.organizationId,
      billing_interval: billingInterval,
    },
  })
  if (handoffError) return jsonError('Unable to create subscription handoff', 500)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email, stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  const baseUrl = resolveBaseUrl()
  const successQuery = `type=onboarding&token=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/payment/complete?${successQuery}`,
      cancel_url: `${baseUrl}/payment/complete?type=onboarding&canceled=1`,
      client_reference_id: user.id,
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: profile?.email || undefined }),
      subscription_data: {
        metadata: {
          checkout_type: 'mobile_onboarding',
          handoff_nonce: claims.nonce,
          user_id: user.id,
          role: actor.role,
          org_id: actor.organizationId || '',
          billing_interval: billingInterval,
        },
      },
      metadata: {
        checkout_type: 'mobile_onboarding',
        handoff_nonce: claims.nonce,
        user_id: user.id,
        role: actor.role,
        org_id: actor.organizationId || '',
        billing_interval: billingInterval,
      },
    }, { idempotencyKey: `mobile_onboarding:${claims.nonce}` })

    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    await consumeMobileHandoff(claims.nonce, session.id, session.url)

    return NextResponse.json({
      checkout_url: session.url,
      expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : expiresAt,
    })
  } catch (error: any) {
    await supabaseAdmin
      .from('mobile_checkout_handoffs')
      .update({
        status: 'issued',
        last_error: error?.message || 'Subscription checkout failed',
        updated_at: new Date().toISOString(),
      })
      .eq('nonce', claims.nonce)
    return jsonError(error?.message || 'Unable to start subscription checkout', 500)
  }
}
