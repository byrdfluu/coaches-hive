import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { claimMobileHandoff, consumeMobileHandoff, releaseMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { resolveConfiguredPriceId, resolveMobileOnboardingPlan } from '@/lib/mobileOnboardingPricing'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { resolveBaseUrl } from '@/lib/siteUrl'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = String(body?.token || '')
  let claims
  try { claims = verifyMobileCheckoutToken(token) } catch (error: any) { return jsonError(error?.message || 'Invalid checkout token', 401) }
  if (claims.type !== 'onboarding' || !claims.role || !claims.tier) return jsonError('Invalid onboarding checkout token')

  try {
    const handoff = await claimMobileHandoff(claims)
    if (handoff.status === 'consumed' && handoff.checkout_url) return NextResponse.json({ url: handoff.checkout_url })
    const plan = resolveMobileOnboardingPlan(claims.role, claims.tier)
    if (!plan) throw new Error('Unsupported onboarding plan')
    const priceId = resolveConfiguredPriceId(plan.priceKeys)
    if (!priceId) throw new Error(`Billing is not configured for this plan (${plan.priceKeys.join(', ')})`)

    const { data: profile } = await supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', claims.userId).maybeSingle()
    let orgId: string | null = null
    if (plan.billingRole === 'org') {
      const { data: membership } = await supabaseAdmin
        .from('organization_memberships').select('org_id').eq('user_id', claims.userId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      orgId = membership?.org_id || null
    }

    let usedTrial = false
    if (profile?.stripe_customer_id) {
      const subscriptions = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 100 })
      usedTrial = subscriptions.data.some((subscription) =>
        subscription.metadata?.billing_role === plan.billingRole
        && Boolean(subscription.trial_start || subscription.trial_end || subscription.metadata?.trial_applied === 'true'),
      )
    }

    const metadata: Record<string, string> = {
      checkout_type: 'mobile_onboarding', handoff_nonce: claims.nonce,
      user_id: claims.userId, billing_role: plan.billingRole, role: claims.role, tier: plan.tier,
      ...(orgId ? { org_id: orgId } : {}),
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
      subscription_data: {
        metadata: { ...metadata, trial_applied: usedTrial ? 'false' : 'true', trial_days: usedTrial ? '0' : String(plan.trialDays) },
        ...(!usedTrial ? { trial_period_days: plan.trialDays } : {}),
      },
      allow_promotion_codes: true,
    }, { idempotencyKey: `mobile_onboarding_checkout:${claims.nonce}` })
    await consumeMobileHandoff(claims.nonce, session.id, session.url)
    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    await releaseMobileHandoff(claims.nonce, error?.message || 'Onboarding checkout failed')
    return jsonError(error?.message || 'Unable to start onboarding checkout', 400)
  }
}

