import { NextResponse } from 'next/server'
import { assertStripeHostedUrl } from '@/lib/paymentSecurity'
import { jsonError } from '@/lib/apiAuth'
import { claimMobileHandoff, consumeMobileHandoff, releaseMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { resolveConfiguredPriceId, resolveMobileOnboardingPlan } from '@/lib/mobileOnboardingPricing'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { resolvePlatformActor } from '@/lib/platformSubscription'
import { resolveBaseUrl } from '@/lib/siteUrl'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getPlan } from '@/lib/allAccessPricing'
import { LEGAL_DOCUMENT_VERSIONS, ORGANIZATION_AGREEMENTS, ORGANIZATION_AGREEMENT_VERSION, ORGANIZATION_AUTHORITY_CONFIRMATION, ORGANIZATION_MINOR_DATA_CONFIRMATION, organizationRecurringBillingConfirmation } from '@/lib/legalAgreements'
import { loadOrgCommercialTerms } from '@/lib/orgCommercialTerms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = String(body?.token || '')
  const requestedTier = String(body?.tier || '').trim().toLowerCase()
  const billingInterval = String(body?.billingInterval || 'month')
  let claims
  try { claims = verifyMobileCheckoutToken(token) } catch (error: any) { return jsonError(error?.message || 'Invalid checkout token', 401) }
  if (claims.type !== 'onboarding' || !['coach', 'athlete', 'org'].includes(claims.role || '')) return jsonError('Invalid onboarding checkout token')

  try {
    const handoff = await claimMobileHandoff(claims)
    if (handoff.status === 'consumed' && handoff.checkout_url) return NextResponse.json({ url: handoff.checkout_url })
    const actor = await resolvePlatformActor(claims.userId)
    if (!actor || actor.role !== claims.role) throw new Error('Subscription account no longer matches this handoff')
    const consent = body?.organizationConsent
    if (actor.role === 'org' && (consent?.authorityAccepted !== true || consent?.recurringBillingAccepted !== true || consent?.minorDataAccepted !== true || consent?.displayedAgreementVersion !== ORGANIZATION_AGREEMENT_VERSION)) throw new Error('Organization agreement and recurring billing consent are required')
    const pricingRole = actor.role === 'org' ? 'org_admin' : actor.role
    const plan = resolveMobileOnboardingPlan(pricingRole, requestedTier, billingInterval)
    if (!plan || !plan.priceKeys.length) throw new Error('Unsupported subscription tier')
    const priceId = resolveConfiguredPriceId(plan.priceKeys)
    if (!priceId) throw new Error('Billing is not configured for this plan')
    const { data: profile } = await supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', claims.userId).maybeSingle()
    const ownerId = actor.organizationId || actor.userId
    const { data: priorSubscription } = await supabaseAdmin.from('platform_subscriptions')
      .select('trial_end').eq('owner_type', actor.role).eq('owner_id', ownerId).maybeSingle()
    const complimentaryUntil = actor.role === 'org' && actor.organizationId ? (await loadOrgCommercialTerms(actor.organizationId)).complimentarySubscriptionUntil : null
    const complimentaryEnd = complimentaryUntil ? Math.floor(new Date(complimentaryUntil).getTime() / 1000) : null
    const hasComplimentaryAccess = Boolean(complimentaryEnd && complimentaryEnd * 1000 > Date.now())
    const trialAlreadyUsed = Boolean(priorSubscription?.trial_end) && !hasComplimentaryAccess
    const metadata: Record<string, string> = {
      checkout_type: 'mobile_onboarding', handoff_nonce: claims.nonce,
      user_id: claims.userId, billing_role: actor.role, role: actor.role, tier: plan.tier,
      plan_key: plan.tier, billing_interval: plan.billingInterval,
      ...(actor.organizationId ? { org_id: actor.organizationId, organization_id: actor.organizationId } : {}),
      ...(actor.role === 'org' ? { agreement_version: ORGANIZATION_AGREEMENT_VERSION } : {}),
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
        metadata: { ...metadata, stripe_price_id: priceId, trial_applied: trialAlreadyUsed ? 'false' : 'true', trial_days: trialAlreadyUsed ? '0' : String(plan.trialDays) },
        ...(!trialAlreadyUsed ? {
          ...(hasComplimentaryAccess ? { trial_end: complimentaryEnd! } : { trial_period_days: plan.trialDays }),
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
        } : {}),
      },
      allow_promotion_codes: true,
    }, { idempotencyKey: `mobile_onboarding_checkout:${claims.nonce}` })
    if (actor.role === 'org' && actor.organizationId) {
      const catalogPlan = getPlan(plan.tier, 'org')
      if (!catalogPlan) throw new Error('Organization plan is unavailable')
      const priceCents = plan.billingInterval === 'year' ? catalogPlan.annualCents : catalogPlan.monthlyCents
      const { error: acceptanceError } = await supabaseAdmin.from('organization_legal_acceptances').upsert({
        organization_id: actor.organizationId, accepted_by_user_id: claims.userId, accepted_by_email: profile?.email || null,
        accepted_by_role: actor.role, agreement_version: ORGANIZATION_AGREEMENT_VERSION,
        agreement_keys: ORGANIZATION_AGREEMENTS.map(a => a.key), authority_confirmed: true,
        document_versions: LEGAL_DOCUMENT_VERSIONS,
        document_snapshot: { effective_version: ORGANIZATION_AGREEMENT_VERSION, documents: ORGANIZATION_AGREEMENTS.map(a => ({ ...a, version: LEGAL_DOCUMENT_VERSIONS[a.key] })) },
        app_version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || null,
        recurring_billing_confirmed: true, minor_data_responsibility_confirmed: true,
        plan_key: plan.tier, billing_interval: plan.billingInterval, price_cents: priceCents,
        trial_days: trialAlreadyUsed ? 0 : plan.trialDays,
        confirmation_text: { authority: ORGANIZATION_AUTHORITY_CONFIRMATION, recurring_billing: organizationRecurringBillingConfirmation(priceCents, plan.billingInterval, trialAlreadyUsed ? 0 : plan.trialDays), minor_data: ORGANIZATION_MINOR_DATA_CONFIRMATION },
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: request.headers.get('user-agent'), stripe_checkout_session_id: session.id,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      }, { onConflict: 'stripe_checkout_session_id' })
      if (acceptanceError) { await stripe.checkout.sessions.expire(session.id).catch(() => undefined); throw acceptanceError }
    }
    await consumeMobileHandoff(claims.nonce, session.id, session.url)
    return NextResponse.json({ url: assertStripeHostedUrl(session.url) })
  } catch (error: any) {
    await releaseMobileHandoff(claims.nonce, error?.message || 'Onboarding checkout failed')
    return jsonError(error?.message || 'Unable to start onboarding checkout', 400)
  }
}
