import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { claimMobileHandoff, consumeMobileHandoff, releaseMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { resolveConfiguredPriceId, resolveMobileOnboardingPlan } from '@/lib/mobileOnboardingPricing'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { resolvePlatformActor } from '@/lib/platformSubscription'
import { resolveBaseUrl } from '@/lib/siteUrl'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = String(body?.token || '')
  const requestedTier = String(body?.tier || '').trim().toLowerCase()
  let claims
  try { claims = verifyMobileCheckoutToken(token) } catch (error: any) { return jsonError(error?.message || 'Invalid checkout token', 401) }
  if (claims.type !== 'onboarding' || !['coach', 'org'].includes(claims.role || '')) return jsonError('Invalid onboarding checkout token')

  try {
    const handoff = await claimMobileHandoff(claims)
    if (handoff.status === 'consumed' && handoff.checkout_url) return NextResponse.json({ url: handoff.checkout_url })
    const actor = await resolvePlatformActor(claims.userId)
    if (!actor || actor.role !== claims.role) throw new Error('Subscription account no longer matches this handoff')
    const pricingRole = actor.role === 'coach' ? 'coach' : 'org_admin'
    const plan = resolveMobileOnboardingPlan(pricingRole, requestedTier)
    if (!plan || !plan.priceKeys.length) throw new Error('Unsupported subscription tier')
    const priceId = resolveConfiguredPriceId(plan.priceKeys)
    if (!priceId) throw new Error('Billing is not configured for this plan')

    const { data: profile } = await supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', claims.userId).maybeSingle()
    const ownerId = actor.organizationId || actor.userId
    const { data: priorSubscription } = await supabaseAdmin.from('platform_subscriptions')
      .select('trial_end').eq('owner_type', actor.role).eq('owner_id', ownerId).maybeSingle()
    const trialAlreadyUsed = Boolean(priorSubscription?.trial_end)
    const metadata: Record<string, string> = {
      checkout_type: 'mobile_onboarding', handoff_nonce: claims.nonce,
      user_id: claims.userId, billing_role: actor.role, role: actor.role, tier: plan.tier,
      ...(actor.organizationId ? { org_id: actor.organizationId, organization_id: actor.organizationId } : {}),
    }
    const baseUrl = resolveBaseUrl()
    const returnQuery = `token=${encodeURIComponent(token)}&type=onboarding`
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: claims.userId,
      ...(profile?.stripe_customer_id ? { customer: profile.stripe_customer_id } : { customer_email: profile?.email || undefined }),
      metadata,
      subscription_data: { metadata, ...(!trialAlreadyUsed ? { trial_period_days: plan.trialDays } : {}) },
      allow_promotion_codes: true,
    }, { idempotencyKey: `mobile_onboarding_checkout:${claims.nonce}` })
    await consumeMobileHandoff(claims.nonce, session.id, session.url)
    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    await releaseMobileHandoff(claims.nonce, error?.message || 'Onboarding checkout failed')
    return jsonError(error?.message || 'Unable to start onboarding checkout', 400)
  }
}
