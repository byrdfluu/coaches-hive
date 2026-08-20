import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAthleteProfileSelection } from '@/lib/athleteProfiles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
import { calculateMarketplacePlatformFeeCents, MARKETPLACE_PLATFORM_FEE_PERCENT } from '@/lib/platformFees'
import { calculateOrgPlatformFeeForOrg, calculateStripeProcessingFeeCents, getFeeSettings } from '@/lib/orgPlatformFees'
import { getPostHogClient } from '@/lib/posthog-server'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { createMobileCheckoutToken } from '@/lib/mobileCheckoutToken'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const athleteId = session.user.id
  const body = await request.json().catch(() => ({}))
  const requestedAthleteProfileId =
    typeof body?.athlete_profile_id === 'string' ? body.athlete_profile_id.trim() || null : null
  const requestedSubProfileId = typeof body?.sub_profile_id === 'string' ? body.sub_profile_id.trim() || null : null
  const redirectToApp = body?.redirect_to_app === true
  const { data: athleteSelection } = await resolveAthleteProfileSelection({
    supabase: supabaseAdmin,
    ownerUserId: athleteId,
    athleteProfileId: requestedAthleteProfileId,
    subProfileId: requestedSubProfileId,
  })
  if (!athleteSelection) return jsonError('Invalid athlete selected for checkout', 403)

  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('cart, stripe_customer_id')
    .eq('id', athleteId)
    .maybeSingle()

  if (profileError) return jsonError('Unable to load cart', 500)

  const rawCart = profileData?.cart
  const storedCartItems: Array<{
    id: string
    quantity?: number
    athlete_profile_id?: string | null
    sub_profile_id?: string | null
    athlete_label?: string | null
  }> = Array.isArray(rawCart)
    ? rawCart
    : []
  const cartItems = storedCartItems.filter((item) =>
    athleteSelection.isPrimary
      ? !item.sub_profile_id && (!(item.athlete_profile_id) || item.athlete_profile_id === athleteSelection.athleteProfileId)
      : (item.athlete_profile_id || item.sub_profile_id || null) === athleteSelection.athleteProfileId,
  )

  if (cartItems.length === 0) return jsonError('Cart is empty', 400)
  // Stripe metadata is capped at 50 keys; ~6 are fixed fields, leaving 44 slots for items.
  if (cartItems.length > 44) return jsonError('Cart exceeds the maximum of 44 items per checkout. Split into multiple orders.', 400)

  const productIds = Array.from(new Set(cartItems.map((item) => item.id).filter(Boolean)))

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, title, name, price, price_cents, coach_id, org_id, type, category')
    .in('id', productIds)

  if (!products || products.length === 0) return jsonError('No valid products found in cart', 400)

  const productMap = new Map(products.map((p: any) => [p.id, p]))

  const coachIds = Array.from(new Set(products.map((p: any) => p.coach_id).filter(Boolean))) as string[]
  const orgIds = Array.from(new Set(products.map((p: any) => p.org_id).filter(Boolean))) as string[]
  const coachStripeMap = new Map<string, string>() // coach_id → stripe_account_id
  const orgStripeMap = new Map<string, string>() // org_id → stripe_account_id
  const feeSettings = await getFeeSettings()

  if (coachIds.length > 0) {
    const coachStatuses = await Promise.all(coachIds.map(async (coachId) => ({
        coachId,
        status: await loadStripeConnectAccountStatus('coach', coachId),
      })))
    ;(coachStatuses || []).forEach(({ coachId, status }) => {
      if (isStripeConnectEnabled(status)) coachStripeMap.set(coachId, status!.stripeAccountId)
    })

    const coachesMissingStripe = coachIds.filter((coachId) => !coachStripeMap.get(coachId))
    if (coachesMissingStripe.length > 0) {
      return jsonError('One or more coaches must finish Stripe Connect onboarding before these products can be purchased.', 400)
    }
  }

  if (orgIds.length > 0) {
    const orgStatuses = await Promise.all(orgIds.map(async (orgId) => ({
      orgId,
      status: await loadStripeConnectAccountStatus('org', orgId),
    })))

    ;(orgStatuses || []).forEach(({ orgId, status }) => {
      if (isStripeConnectEnabled(status)) orgStripeMap.set(orgId, status!.stripeAccountId)
    })

    const orgsMissingStripe = orgIds.filter((orgId) => !orgStripeMap.get(orgId))
    if (orgsMissingStripe.length > 0) {
      return jsonError('One or more organizations must finish Stripe Connect onboarding before these products can be purchased.', 400)
    }
  }

  type ItemMeta = {
    productId: string
    qty: number
    coachId: string | null
    orgId: string | null
    amountCents: number
    platformFee: number
    netAmount: number
    stripeAccountId: string | null
    sellerType: 'coach' | 'org'
    sellerId: string | null
  }

  const lineItems: Array<{
    price_data: { currency: string; unit_amount: number; product_data: { name: string } }
    quantity: number
  }> = []
  const itemMeta: ItemMeta[] = []

  for (const cartItem of cartItems) {
    const product = productMap.get(cartItem.id) as any
    if (!product) continue

    const qty = Math.max(1, Math.min(99, Number(cartItem.quantity) || 1))
    const unitAmount = product.price_cents
      ? Math.round(product.price_cents)
      : Math.round(Number(product.price || 0) * 100)
    if (!unitAmount || unitAmount <= 0) continue

    const coachId: string | null = product.coach_id || null
    const orgId: string | null = product.org_id || null
    const totalAmountCents = unitAmount * qty
    const feePercent = feeSettings.marketplacePlatformFeePercent || MARKETPLACE_PLATFORM_FEE_PERCENT
    const platformFee = orgId
      ? (await calculateOrgPlatformFeeForOrg({ amountCents: totalAmountCents, orgId, kind: 'marketplace' })).platformFeeCents
      : calculateMarketplacePlatformFeeCents(totalAmountCents)
    const netAmount = totalAmountCents - platformFee
    const stripeAccountId = coachId
      ? (coachStripeMap.get(coachId) || null)
      : orgId
        ? (orgStripeMap.get(orgId) || null)
        : null
    const sellerType: 'coach' | 'org' = coachId ? 'coach' : 'org'
    const sellerId = coachId || orgId || null

    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: unitAmount,
        product_data: { name: product.title || product.name || 'Product' },
      },
      quantity: qty,
    })

    itemMeta.push({ productId: product.id, qty, coachId, orgId, amountCents: totalAmountCents, platformFee, netAmount, stripeAccountId, sellerType, sellerId })
  }

  if (lineItems.length === 0) return jsonError('No valid items to checkout', 400)

  // Determine single-destination transfer eligibility
  const uniqueCoachIds = Array.from(new Set(itemMeta.map((i) => i.coachId).filter(Boolean)))
  const uniqueOrgIds = Array.from(new Set(itemMeta.map((i) => i.orgId).filter(Boolean)))
  const isSingleCoach = uniqueCoachIds.length === 1 && uniqueOrgIds.length === 0
  const isSingleOrg = uniqueOrgIds.length === 1 && uniqueCoachIds.length === 0

  let paymentIntentData: Record<string, unknown> | undefined

  if (isSingleCoach) {
    const stripeAccountId = coachStripeMap.get(uniqueCoachIds[0] as string)
    if (stripeAccountId) {
      const totalFee = itemMeta.reduce((sum, i) => sum + i.platformFee, 0)
      paymentIntentData = {
        application_fee_amount: totalFee,
        transfer_data: { destination: stripeAccountId },
      }
    }
  } else if (isSingleOrg) {
    const orgId = uniqueOrgIds[0] as string
    const stripeAccountId = orgStripeMap.get(orgId)
    if (stripeAccountId) {
      const totalFee = itemMeta.reduce((sum, i) => sum + i.platformFee, 0)
      paymentIntentData = {
        application_fee_amount: totalFee,
        transfer_data: { destination: stripeAccountId },
      }
    }
  }
  // Multi-coach/org: platform collects, transfers dispatched per seller in webhook

  // Encode cart items into Stripe session metadata for webhook reconstruction
  const metadata: Record<string, string> = {
    athlete_id: athleteId,
    athlete_profile_id: athleteSelection.athleteProfileId,
    checkout_type: 'cart',
    item_count: String(itemMeta.length),
    ...(athleteSelection.legacySubProfileId ? { sub_profile_id: athleteSelection.legacySubProfileId } : {}),
    athlete_label:
      (cartItems.find((item) => typeof item.athlete_label === 'string' && item.athlete_label.trim())?.athlete_label || 'Primary athlete'),
  }
  itemMeta.forEach((item, i) => {
    // Format: productId|qty|coachId|orgId|amountCents|platformFee|netAmount|stripeAccountId|sellerType|sellerId
    metadata[`item_${i}`] = [
      item.productId,
      item.qty,
      item.coachId || '',
      item.orgId || '',
      item.amountCents,
      item.platformFee,
      item.netAmount,
      item.stripeAccountId || '',
      item.sellerType,
      item.sellerId || '',
    ].join('|')
  })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // When the app requests an in-app-browser handoff, route success through the
  // same /payment/complete -> coacheshive:// bridge every other mobile checkout
  // uses, instead of landing on a plain web page the app has no way to detect.
  let mobileToken: string | null = null
  let mobileHandoffNonce: string | null = null
  if (redirectToApp) {
    const { token, claims } = createMobileCheckoutToken({
      type: 'cart',
      userId: athleteId,
      resourceId: athleteId,
    })
    const { error: handoffError } = await supabaseAdmin.from('mobile_checkout_handoffs').insert({
      nonce: claims.nonce,
      user_id: athleteId,
      checkout_type: 'cart',
      resource_id: athleteId,
      status: 'processing',
      metadata: { item_count: itemMeta.length },
      token_expires_at: new Date(claims.expiresAt * 1000).toISOString(),
      expires_at: new Date(claims.expiresAt * 1000).toISOString(),
    })
    if (handoffError) return jsonError('Unable to create checkout handoff', 500)
    mobileToken = token
    mobileHandoffNonce = claims.nonce
  }

  const successUrl = mobileToken
    ? `${origin}/payment/complete?token=${encodeURIComponent(mobileToken)}&type=cart&session_id={CHECKOUT_SESSION_ID}`
    : `${origin}/athlete/marketplace/orders?cart_checkout=success`
  const cancelUrl = mobileToken
    ? `${origin}/payment/complete?token=${encodeURIComponent(mobileToken)}&type=cart&canceled=1`
    : `${origin}/athlete/marketplace/cart`

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: athleteId,
      ...(profileData?.stripe_customer_id ? { customer: profileData.stripe_customer_id } : {}),
      ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
      metadata,
    }, { idempotencyKey: `cart-checkout:${athleteId}:${itemMeta.map((item) => `${item.productId}-${item.qty}`).sort().join('.')}` })

    if (mobileHandoffNonce) {
      const { error: updateError } = await supabaseAdmin
        .from('mobile_checkout_handoffs')
        .update({
          status: 'consumed',
          stripe_checkout_session_id: checkoutSession.id,
          checkout_url: checkoutSession.url,
          updated_at: new Date().toISOString(),
        })
        .eq('nonce', mobileHandoffNonce)
      if (updateError) {
        await stripe.checkout.sessions.expire(checkoutSession.id).catch(() => undefined)
        return jsonError('Unable to bind checkout to cart purchase', 500)
      }
    }

    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: athleteId,
      event: 'cart_checkout_session_created',
      properties: {
        item_count: lineItems.length,
        total_amount_cents: lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0),
      },
    })

    const grossCents = itemMeta.reduce((sum, item) => sum + item.amountCents, 0)
    const platformFeeCents = itemMeta.reduce((sum, item) => sum + item.platformFee, 0)
    const stripeProcessingFeeCents = calculateStripeProcessingFeeCents(grossCents, feeSettings)
    return NextResponse.json({
      url: checkoutSession.url,
      checkout_url: checkoutSession.url,
      expires_at: checkoutSession.expires_at
        ? new Date(checkoutSession.expires_at * 1000).toISOString()
        : null,
      fee_breakdown: {
        gross_cents: grossCents,
        platform_fee_cents: platformFeeCents,
        stripe_processing_fee_cents: stripeProcessingFeeCents,
        net_cents: Math.max(0, grossCents - platformFeeCents),
        fee_rate: grossCents > 0 ? (platformFeeCents / grossCents) * 100 : 0,
        kind: 'marketplace',
      },
    })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to create checkout session', 500)
  }
}
