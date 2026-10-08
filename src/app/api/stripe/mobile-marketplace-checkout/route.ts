import { NextResponse } from 'next/server'
import { assertStripeHostedUrl } from '@/lib/paymentSecurity'
import { jsonError } from '@/lib/apiAuth'
import { claimMobileHandoff, consumeMobileHandoff, releaseMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { calculateMarketplacePlatformFeeCents, MARKETPLACE_PLATFORM_FEE_PERCENT } from '@/lib/platformFees'
import { calculateOrgPlatformFeeForOrg, calculateStripeProcessingFeeCents, getFeeSettings } from '@/lib/orgPlatformFees'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrganizationPayment, organizationCheckoutLineItems, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'
import { idempotencyKeyFor, requestIdFor } from '@/lib/requestSecurity'
import { canonicalCheckoutResponse, checkoutJson, recordCheckoutAttempt } from '@/lib/checkoutAttempts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const body = await request.json().catch(() => null)
  const key = idempotencyKeyFor(request, body && typeof body === 'object' ? body : {})
  if ('error' in key) return jsonError(
    key.error === 'conflict' ? 'Idempotency-Key and idempotency_key must match.' : 'A valid Idempotency-Key header is required.',
    key.error === 'conflict' ? 409 : 422,
  )
  const token = String(body?.token || '')
  let claims
  try { claims = verifyMobileCheckoutToken(token) } catch (error: any) { return jsonError(error?.message || 'Invalid checkout token', 401) }
  if (claims.type !== 'marketplace' || !claims.resourceId) return jsonError('Invalid marketplace checkout token')

  try {
    const handoff = await claimMobileHandoff(claims)
    if (handoff.status === 'consumed' && handoff.checkout_url && handoff.stripe_checkout_session_id) {
      const prior = await stripe.checkout.sessions.retrieve(handoff.stripe_checkout_session_id).catch(() => null)
      if (prior?.status === 'open' && prior.url && (!prior.expires_at || prior.expires_at * 1000 > Date.now())) {
        const hostedUrl = assertStripeHostedUrl(prior.url)
        const payload = canonicalCheckoutResponse({ payload: { url: hostedUrl, checkout_url: hostedUrl,
          expires_at: prior.expires_at ? new Date(prior.expires_at * 1000).toISOString() : null,
          fee_breakdown: handoff.metadata?.fee_breakdown || null, reused: true }, requestId,
        checkoutType: 'marketplace', checkoutRecordId: claims.nonce })
        return checkoutJson(payload, requestId)
      }
      await supabaseAdmin.from('mobile_checkout_handoffs').update({ status: 'expired', checkout_url: null,
        last_error: 'Stripe Checkout Session expired', updated_at: new Date().toISOString() }).eq('nonce', claims.nonce)
      return jsonError('Checkout expired. Start a new purchase to continue.', 409)
    }

    const { data: item } = await supabaseAdmin.from('marketplace_items').select('*').eq('id', claims.resourceId).maybeSingle()
    if (!item || !item.is_active) throw new Error('Marketplace item is unavailable')
    if (item.inventory_count !== null && Number(item.inventory_count) <= 0) throw new Error('Marketplace item is out of stock')
    const amountCents = Math.round(Number(item.price || 0) * 100)
    if (amountCents <= 0) throw new Error('Marketplace item price is invalid')

    let destination: string | null = null
    let platformFeeCents = 0
    let stripeProcessingFeeCents = 0
    let feeRate = MARKETPLACE_PLATFORM_FEE_PERCENT
    if (item.coach_id) {
      const [connectStatus, feeSettings] = await Promise.all([
        loadStripeConnectAccountStatus('coach', item.coach_id),
        getFeeSettings(),
      ])
      destination = isStripeConnectEnabled(connectStatus) ? connectStatus!.stripeAccountId : null
      platformFeeCents = calculateMarketplacePlatformFeeCents(
        amountCents,
        feeSettings.marketplacePlatformFeePercent,
        feeSettings.marketplacePlatformFeeCapCents,
      )
      stripeProcessingFeeCents = calculateStripeProcessingFeeCents(amountCents, feeSettings)
      feeRate = feeSettings.marketplacePlatformFeePercent
    } else if (item.org_id) {
      const [connectStatus, feeBreakdown] = await Promise.all([
        loadStripeConnectAccountStatus('org', item.org_id),
        calculateOrgPlatformFeeForOrg({
          amountCents,
          orgId: item.org_id,
          kind: 'marketplace',
        }),
      ])
      destination = isStripeConnectEnabled(connectStatus) ? connectStatus!.stripeAccountId : null
      platformFeeCents = feeBreakdown.platformFeeCents
      stripeProcessingFeeCents = feeBreakdown.stripeProcessingFeeCents
      feeRate = feeBreakdown.feeRate
    }
    if (!destination) throw new Error('Seller must finish Stripe Connect onboarding before accepting purchases')
    const paymentContract = item.org_id ? calculateOrganizationPayment(amountCents) : null

    const { data: buyer } = await supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', claims.userId).maybeSingle()
    const baseUrl = resolveBaseUrl()
    const returnQuery = `token=${encodeURIComponent(token)}&type=marketplace`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'us_bank_account'],
      line_items: paymentContract
        ? organizationCheckoutLineItems(item.name || 'Marketplace item', paymentContract)
        : [{ price_data: { currency: 'usd', unit_amount: amountCents, product_data: { name: item.name || 'Marketplace item', description: item.description || undefined } }, quantity: 1 }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: claims.userId,
      ...(buyer?.stripe_customer_id ? { customer: buyer.stripe_customer_id } : { customer_email: buyer?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: paymentContract?.application_fee_cents ?? platformFeeCents,
        transfer_data: { destination },
        on_behalf_of: destination,
        statement_descriptor_suffix: 'COACHES HIVE',
        metadata: {
          checkout_type: 'mobile_marketplace',
          item_id: item.id,
          buyer_id: claims.userId,
          handoff_nonce: claims.nonce,
          platformFeeCents: String(platformFeeCents),
          platformFeeRate: String(feeRate),
          stripeProcessingFeeCents: String(stripeProcessingFeeCents),
          netAmountCents: String(Math.max(amountCents - platformFeeCents, 0)),
          ...(paymentContract ? organizationPaymentMetadata(paymentContract) : {}),
        },
      },
      metadata: {
        checkout_type: 'mobile_marketplace', item_id: item.id, buyer_id: claims.userId,
        coach_id: item.coach_id || '', org_id: item.org_id || '', handoff_nonce: claims.nonce,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, { idempotencyKey: `mobile_marketplace_checkout:${claims.nonce}:${key.key}` })
    const responseFeeBreakdown = {
      ...(paymentContract || {}),
      gross_cents: amountCents,
      platform_fee_cents: platformFeeCents,
      stripe_processing_fee_cents: stripeProcessingFeeCents,
      net_cents: Math.max(amountCents - platformFeeCents, 0),
      fee_rate: feeRate,
      kind: 'marketplace',
    }
    await consumeMobileHandoff(claims.nonce, session.id, session.url, {
      fee_breakdown: responseFeeBreakdown,
    })
    const expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
    const payload = canonicalCheckoutResponse({ payload: {
      url: session.url,
      checkout_url: assertStripeHostedUrl(session.url),
      expires_at: expiresAt,
      fee_breakdown: responseFeeBreakdown,
    }, requestId, checkoutType: 'marketplace', checkoutRecordId: claims.nonce })
    await recordCheckoutAttempt({ buyerUserId: claims.userId, idempotencyKey: key.key, requestId,
      checkoutType: 'marketplace', checkoutRecordId: claims.nonce, purchaseId: claims.nonce,
      organizationId: item.org_id || null, offeringType: 'marketplace_product', offeringId: item.id,
      billingType: 'one_time', amountCents: amountCents + (paymentContract?.service_fee_cents || 0),
      stripeCheckoutSessionId: session.id, expiresAt, status: 'checkout_pending' })
    return checkoutJson(payload, requestId)
  } catch (error: any) {
    await releaseMobileHandoff(claims.nonce, error?.message || 'Marketplace checkout failed')
    return jsonError(error?.message || 'Unable to start marketplace checkout', 400)
  }
}
