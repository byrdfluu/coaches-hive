import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { getAllAccessPriceKeys, getPlan, normalizeBillingInterval, resolveFirstConfiguredPrice } from '@/lib/allAccessPricing'
import { resolveMobileSubscriptionOwner } from '@/lib/mobileSubscriptionAuthority'
import { resolveBaseUrl } from '@/lib/siteUrl'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { LEGAL_DOCUMENT_VERSIONS, ORGANIZATION_AGREEMENTS, ORGANIZATION_AGREEMENT_VERSION, ORGANIZATION_AUTHORITY_CONFIRMATION, ORGANIZATION_MINOR_DATA_CONFIRMATION, organizationRecurringBillingConfirmation } from '@/lib/legalAgreements'
import { loadOrgCommercialTerms } from '@/lib/orgCommercialTerms'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'
import type Stripe from 'stripe'
import { normalizeUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MOBILE_AGREEMENT_VERSION = ORGANIZATION_AGREEMENT_VERSION

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const fail = (code: string, message: string, status = 400, retryable = status === 429 || status >= 500) =>
    correlatedError(requestId, code, message, status, retryable)
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Authentication is required.', 401, false)
  if (!user.email_confirmed_at && !user.confirmed_at) return fail('email_verification_required', 'Verify your email before starting a subscription.', 403, false)
  if (!(await enforcePaymentRateLimit(user.id, 'subscription_checkout', 6, 60).catch(() => false))) {
    return fail('rate_limited', 'Too many subscription requests. Try again shortly.', 429, true)
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('invalid_request', 'A JSON request body is required.')
  const rawBodyWorkspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const rawHeaderWorkspaceId = String(request.headers.get('x-workspace-id') || '').trim()
  const workspaceId = normalizeUuid(rawBodyWorkspaceId)
  const headerWorkspaceId = normalizeUuid(rawHeaderWorkspaceId)
  const nestedConsent = body.organization_consent && typeof body.organization_consent === 'object'
    ? body.organization_consent : null
  // Older mobile builds sent the same clickwrap fields at the top level.
  // Prefer the nested contract while retaining temporary backwards compatibility.
  const consent = {
    authority_accepted: nestedConsent?.authority_accepted === true || (!nestedConsent && body.authority_accepted === true),
    recurring_billing_accepted: nestedConsent?.recurring_billing_accepted === true || (!nestedConsent && body.recurring_billing_accepted === true),
    minor_data_accepted: nestedConsent?.minor_data_accepted === true || (!nestedConsent && body.minor_data_accepted === true),
    agreement_version: nestedConsent?.agreement_version || (!nestedConsent ? body.agreement_version : null),
  }
  console.info('[mobile/subscription/start] parsed request', {
    user_id: user.id, request_id: requestId, x_workspace_id: rawHeaderWorkspaceId || null,
    body_workspace_id: rawBodyWorkspaceId || null, normalized_workspace_id: workspaceId || null,
    billing_interval: String(body.billing_interval || '') || null,
    authority_accepted: consent?.authority_accepted === true,
    recurring_billing_accepted: consent?.recurring_billing_accepted === true,
    minor_data_accepted: consent?.minor_data_accepted === true,
    received_agreement_version: String(consent?.agreement_version || '') || null,
    expected_agreement_version: MOBILE_AGREEMENT_VERSION,
  })
  if (!workspaceId || !headerWorkspaceId) return fail('workspace_required', 'A selected workspace is required.')
  if (workspaceId !== headerWorkspaceId) return fail('workspace_context_mismatch', 'The selected workspace does not match the request body.', 409, false)
  const owner = await resolveMobileSubscriptionOwner(user.id, workspaceId)
  if (!owner) return fail('workspace_billing_forbidden', 'You do not have billing permission for this workspace.', 403, false)
  if (body.billing_interval !== 'month' && body.billing_interval !== 'year') return fail('invalid_billing_interval', 'billing_interval must be month or year.')

  const billingInterval = normalizeBillingInterval(body.billing_interval)
  const planKey = String(body.plan_key || (owner.ownerType === 'coach' ? 'team_starter' : '')).trim().toLowerCase()
  const allowedPlans = owner.ownerType === 'coach' ? ['team_starter']
    : owner.ownerType === 'org' ? ['growing_organization', 'established_organization'] : ['league_enterprise']
  if (!allowedPlans.includes(planKey)) return fail('plan_not_available', 'Plan is not available for this workspace.')
  const plan = getPlan(planKey, owner.ownerType === 'coach' ? 'coach' : 'org')
  if (!plan) return fail('plan_not_available', 'Plan is not available for this workspace.')
  const expectedPlanRole = owner.ownerType === 'coach' ? 'coach' : 'org'
  if (plan.role !== expectedPlanRole) return fail('plan_not_available', 'Plan is not available for this workspace.')
  if (owner.ownerType === 'league' && !plan.selfService) {
    return fail('contact_required', 'League & Enterprise setup requires help from Coaches Hive. Contact support to continue.', 409, false)
  }

  const needsConsent = owner.ownerType !== 'coach'
  if (needsConsent) {
    const missingFields = [
      consent?.authority_accepted === true ? null : 'authority_accepted',
      consent?.recurring_billing_accepted === true ? null : 'recurring_billing_accepted',
      consent?.minor_data_accepted === true ? null : 'minor_data_accepted',
    ].filter((field): field is string => Boolean(field))
    if (missingFields.length) {
      return NextResponse.json({ error: { code: 'organization_consent_required',
        message: 'Organization subscription authorization is required.', missing_fields: missingFields,
        expected_agreement_version: MOBILE_AGREEMENT_VERSION, retryable: false, request_id: requestId } },
      { status: 400, headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
    }
    if (String(consent.agreement_version || '') !== MOBILE_AGREEMENT_VERSION) {
      return NextResponse.json({ error: { code: 'agreement_version_mismatch',
        message: 'The organization agreement has changed. Review the current agreement and try again.',
        expected_agreement_version: MOBILE_AGREEMENT_VERSION,
        received_agreement_version: String(consent.agreement_version || '') || null,
        retryable: false, request_id: requestId } },
      { status: 409, headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
    }
  }

  const { priceId, keysTried } = resolveFirstConfiguredPrice(getAllAccessPriceKeys(
    owner.ownerType === 'coach' ? 'coach' : 'org', billingInterval,
    owner.ownerType === 'coach' ? null : planKey as 'growing_organization' | 'established_organization',
  ))
  if (!priceId) {
    safePaymentError('[mobile/subscription/start] price missing', new Error('Stripe price missing'), { request_id: requestId, keys: keysTried.join(',') })
    return fail('subscription_price_unavailable', 'This subscription price is temporarily unavailable.', 503, true)
  }

  let configuredPrice: Stripe.Price
  try {
    configuredPrice = await stripe.prices.retrieve(priceId)
    const keyIsLive = String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')
    const expectedCents = billingInterval === 'year' ? plan.annualCents : plan.monthlyCents
    if (!configuredPrice.active || configuredPrice.type !== 'recurring'
      || configuredPrice.recurring?.interval !== billingInterval
      || configuredPrice.livemode !== keyIsLive
      || configuredPrice.unit_amount !== expectedCents) {
      safePaymentError('[mobile/subscription/start] invalid configured price', {
        code: 'stripe_price_contract_mismatch',
        message: 'Configured Stripe price does not match the selected plan contract.',
      }, { request_id: requestId, workspace_id: workspaceId, plan_key: planKey,
        billing_interval: billingInterval, stripe_price_id: priceId })
      return fail('subscription_price_unavailable', 'This subscription price is temporarily unavailable.', 503, false)
    }
  } catch (error) {
    safePaymentError('[mobile/subscription/start] price validation failed', error, {
      request_id: requestId, workspace_id: workspaceId, plan_key: planKey,
      billing_interval: billingInterval, stripe_price_id: priceId,
    })
    return fail('subscription_price_unavailable', 'This subscription price is temporarily unavailable.', 503, true)
  }

  const { data: prior } = await supabaseAdmin.from('platform_subscriptions')
    .select('id,workspace_id,trial_end,stripe_customer_id,stripe_checkout_session_id,stripe_price_id,plan_key,billing_interval,status,purchase_channel')
    .eq('owner_type', owner.ownerType).eq('owner_id', owner.ownerId).maybeSingle()
  if (prior?.purchase_channel === 'apple_iap') return fail('apple_managed_subscription', 'This subscription is managed through Apple.', 409, false)
  if (['active', 'trialing'].includes(String(prior?.status || ''))) return fail('subscription_already_active', 'This workspace already has an active subscription.', 409, false)

  if (prior?.workspace_id && normalizeUuid(prior.workspace_id) !== workspaceId) return fail('subscription_workspace_mismatch', 'The subscription belongs to another workspace.', 409, false)
  if (prior?.status === 'incomplete' && prior.stripe_checkout_session_id && prior.plan_key === planKey
    && prior.billing_interval === billingInterval && prior.stripe_price_id === priceId) {
    const existingSession = await stripe.checkout.sessions.retrieve(prior.stripe_checkout_session_id).catch(() => null)
    if (existingSession?.status === 'open' && existingSession.url) {
      return NextResponse.json({ checkout_url: assertStripeHostedUrl(existingSession.url),
        expires_at: existingSession.expires_at ? new Date(existingSession.expires_at * 1000).toISOString() : null,
        request_id: requestId }, { headers: { 'X-Coaches-Hive-Support-Reference': requestId, 'X-Idempotent-Replay': 'true' } })
    }
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('email,full_name,stripe_customer_id').eq('id', user.id).maybeSingle()
  let customerId = prior?.stripe_customer_id || profile?.stripe_customer_id || null
  try {
    if (customerId) {
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId)
        if (existingCustomer.deleted) customerId = null
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'resource_missing') customerId = null
        else throw error
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, name: profile?.full_name || undefined,
        metadata: { user_id: user.id, workspace_id: workspaceId, owner_type: owner.ownerType, owner_id: owner.ownerId } },
      { idempotencyKey: `subscription-customer:v2:${owner.ownerType}:${owner.ownerId}:${workspaceId}` })
      customerId = customer.id
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }
  } catch (error) {
    safePaymentError('[mobile/subscription/start] customer failed', error, { request_id: requestId, workspace_id: workspaceId })
    return fail('stripe_customer_failed', 'Unable to prepare billing right now.', 502, true)
  }

  const trialDays = plan.trialDays
  const complimentaryUntil = owner.organizationId ? (await loadOrgCommercialTerms(owner.organizationId)).complimentarySubscriptionUntil : null
  const complimentaryEnd = complimentaryUntil ? Math.floor(new Date(complimentaryUntil).getTime() / 1000) : null
  const trialApplied = Boolean(complimentaryEnd && complimentaryEnd * 1000 > Date.now()) || !prior?.trial_end
  const metadata = {
    checkout_type: 'mobile_onboarding', user_id: user.id, role: owner.ownerType,
    owner_type: owner.ownerType, owner_id: owner.ownerId, org_id: owner.organizationId || '', league_id: owner.leagueId || '',
    workspace_id: workspaceId, billing_interval: billingInterval, plan_key: planKey, stripe_price_id: priceId,
    agreement_version: needsConsent ? ORGANIZATION_AGREEMENT_VERSION : '', request_id: requestId,
  }

  let checkoutStage = 'create_checkout_session'
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${resolveBaseUrl()}/payment/complete?type=onboarding&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${resolveBaseUrl()}/payment/complete?type=onboarding&canceled=1`, client_reference_id: user.id,
      subscription_data: { metadata, ...(trialApplied ? {
        ...(complimentaryEnd && complimentaryEnd * 1000 > Date.now() ? { trial_end: complimentaryEnd } : { trial_period_days: trialDays }),
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
      } : {}) }, payment_method_collection: 'always', metadata,
    }, { idempotencyKey: `mobile-subscription:${owner.ownerType}:${owner.ownerId}:${planKey}:${billingInterval}:${requestId}` })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    const priceCents = billingInterval === 'year' ? plan.annualCents : plan.monthlyCents
    if (needsConsent) {
      checkoutStage = 'persist_workspace_consent'
      const { error: consentError } = await supabaseAdmin.from('workspace_subscription_consents').upsert({
        workspace_id: workspaceId, owner_type: owner.ownerType, owner_id: owner.ownerId, organization_id: owner.organizationId,
        league_id: owner.leagueId, accepted_by_user_id: user.id, submitted_agreement_version: MOBILE_AGREEMENT_VERSION,
        canonical_agreement_version: ORGANIZATION_AGREEMENT_VERSION, authority_confirmed: true, recurring_billing_confirmed: true,
        minor_data_responsibility_confirmed: true, plan_key: planKey, billing_interval: billingInterval, price_cents: priceCents,
        stripe_checkout_session_id: session.id, stripe_customer_id: customerId, request_id: requestId,
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, user_agent: request.headers.get('user-agent'),
      }, { onConflict: 'stripe_checkout_session_id' })
      if (consentError) {
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
        throw consentError
      }
      if (owner.organizationId) {
        checkoutStage = 'persist_organization_legal_acceptance'
        const { error: organizationConsentError } = await supabaseAdmin.from('organization_legal_acceptances').upsert({
          organization_id: owner.organizationId, accepted_by_user_id: user.id, accepted_by_email: profile?.email || null,
          accepted_by_role: 'org', agreement_version: ORGANIZATION_AGREEMENT_VERSION,
          agreement_keys: ORGANIZATION_AGREEMENTS.map(document => document.key), authority_confirmed: true,
          recurring_billing_confirmed: true, minor_data_responsibility_confirmed: true,
          document_versions: LEGAL_DOCUMENT_VERSIONS,
          document_snapshot: { effective_version: ORGANIZATION_AGREEMENT_VERSION,
            documents: ORGANIZATION_AGREEMENTS.map(document => ({ ...document, version: LEGAL_DOCUMENT_VERSIONS[document.key] })) },
          app_version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || null,
          plan_key: planKey, billing_interval: billingInterval, price_cents: priceCents, trial_days: trialApplied ? trialDays : 0,
          confirmation_text: { authority: ORGANIZATION_AUTHORITY_CONFIRMATION,
            recurring_billing: organizationRecurringBillingConfirmation(priceCents, billingInterval, trialApplied ? trialDays : 0),
            minor_data: ORGANIZATION_MINOR_DATA_CONFIRMATION },
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent'), stripe_checkout_session_id: session.id, stripe_customer_id: customerId,
        }, { onConflict: 'stripe_checkout_session_id' })
        if (organizationConsentError) {
          await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
          throw organizationConsentError
        }
      }
    }
    checkoutStage = 'persist_platform_subscription'
    const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('platform_subscriptions').upsert({
      owner_type: owner.ownerType, owner_id: owner.ownerId, user_id: user.id, organization_id: owner.organizationId,
      league_id: owner.leagueId, workspace_id: workspaceId, tier: planKey, plan_key: planKey, status: 'incomplete',
      billing_interval: billingInterval, stripe_price_id: priceId, stripe_customer_id: customerId,
      stripe_checkout_session_id: session.id, purchase_channel: 'stripe', updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_type,owner_id' }).select('id').single()
    if (subscriptionError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      throw subscriptionError
    }
    checkoutStage = 'audit_checkout_creation'
    await auditPaymentAction({ actorUserId: user.id, workspaceId, organizationId: owner.organizationId,
      action: 'subscription_checkout_created', targetType: 'platform_subscription', targetId: subscription.id,
      stripeObjectId: session.id, result: 'succeeded', metadata: { plan_key: planKey, billing_interval: billingInterval, request_id: requestId } })
    return NextResponse.json({ checkout_url: assertStripeHostedUrl(session.url),
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : new Date(Date.now() + 86400000).toISOString(), request_id: requestId },
    { headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
  } catch (error) {
    safePaymentError('[mobile/subscription/start] failed', error, {
      request_id: requestId, workspace_id: workspaceId, plan_key: planKey,
      billing_interval: billingInterval, stripe_price_id: priceId, checkout_stage: checkoutStage,
    })
    return fail('subscription_checkout_failed', 'Unable to start subscription checkout.', 502, true)
  }
}
