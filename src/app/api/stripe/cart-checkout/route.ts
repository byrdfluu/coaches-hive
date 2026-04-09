import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
import { FeeTier, getFeePercentage, resolveProductCategory } from '@/lib/platformFees'
import { ORG_MARKETPLACE_FEE } from '@/lib/orgPricing'
import {
  checkGuardianApproval,
  guardianApprovalBlockedResponse,
  getAthleteGuardianProfile,
  profileNeedsGuardianApproval,
} from '@/lib/guardianApproval'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const athleteId = session.user.id
  const body = await request.json().catch(() => ({}))
  const subProfileId = typeof body?.sub_profile_id === 'string' ? body.sub_profile_id.trim() || null : null

  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('cart, stripe_customer_id')
    .eq('id', athleteId)
    .maybeSingle()

  const rawCart = profileData?.cart
  const storedCartItems: Array<{
    id: string
    quantity?: number
    sub_profile_id?: string | null
    athlete_label?: string | null
  }> = Array.isArray(rawCart)
    ? rawCart
    : []
  const cartItems = storedCartItems.filter((item) =>
    subProfileId ? item.sub_profile_id === subProfileId : !item.sub_profile_id,
  )

  if (cartItems.length === 0) return jsonError('Cart is empty', 400)

  const productIds = Array.from(new Set(cartItems.map((item) => item.id).filter(Boolean)))

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, title, name, price, price_cents, coach_id, org_id, type, category')
    .in('id', productIds)

  if (!products || products.length === 0) return jsonError('No valid products found in cart', 400)

  // Guardian approval check — block minor athletes if any product target isn't approved
  const guardianProfile = await getAthleteGuardianProfile(athleteId)
  if (profileNeedsGuardianApproval(guardianProfile)) {
    const checkedTargets = new Set<string>()
    for (const product of products as any[]) {
      const targetType: 'coach' | 'org' | null = product.org_id ? 'org' : product.coach_id ? 'coach' : null
      const targetId: string = product.org_id || product.coach_id || ''
      if (!targetType || !targetId) continue
      const key = `${targetType}:${targetId}`
      if (checkedTargets.has(key)) continue
      checkedTargets.add(key)
      const guardianCheck = await checkGuardianApproval({
        athleteId,
        targetType,
        targetId,
        scope: 'transactions',
      })
      if (!guardianCheck.allowed) {
        return guardianApprovalBlockedResponse({
          scope: 'transactions',
          targetType,
          targetId,
          pending: guardianCheck.pending,
          approvalId: guardianCheck.approvalId,
        })
      }
    }
  }

  const productMap = new Map(products.map((p: any) => [p.id, p]))

  const { data: feeRuleRows } = await supabaseAdmin
    .from('platform_fee_rules')
    .select('tier, category, percentage')
    .eq('active', true)

  const coachIds = Array.from(new Set(products.map((p: any) => p.coach_id).filter(Boolean))) as string[]
  const coachPlanMap = new Map<string, string>()
  const coachStripeMap = new Map<string, string>() // coach_id → stripe_account_id

  if (coachIds.length > 0) {
    const [{ data: planRows }, { data: coachProfiles }] = await Promise.all([
      supabaseAdmin.from('coach_plans').select('coach_id, tier').in('coach_id', coachIds),
      supabaseAdmin.from('profiles').select('id, stripe_account_id').in('id', coachIds),
    ])
    ;(planRows || []).forEach((row: any) => coachPlanMap.set(row.coach_id, row.tier))
    ;(coachProfiles || []).forEach((p: any) => {
      if (p.stripe_account_id) coachStripeMap.set(p.id, p.stripe_account_id)
    })
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

    const category = resolveProductCategory(product.type || product.category)
    const coachId: string | null = product.coach_id || null
    const orgId: string | null = product.org_id || null
    const tier = (coachId ? coachPlanMap.get(coachId) : null) || 'starter'
    const feePercent = coachId
      ? getFeePercentage(tier as FeeTier, category, feeRuleRows || [])
      : ORG_MARKETPLACE_FEE
    const totalAmountCents = unitAmount * qty
    const platformFee = Math.round(totalAmountCents * (feePercent / 100))
    const netAmount = totalAmountCents - platformFee
    const stripeAccountId = coachId ? (coachStripeMap.get(coachId) || null) : null

    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: unitAmount,
        product_data: { name: product.title || product.name || 'Product' },
      },
      quantity: qty,
    })

    itemMeta.push({ productId: product.id, qty, coachId, orgId, amountCents: totalAmountCents, platformFee, netAmount, stripeAccountId })
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
    const { data: orgSettings } = await supabaseAdmin
      .from('org_settings')
      .select('stripe_account_id')
      .eq('org_id', orgId)
      .maybeSingle()
    if (orgSettings?.stripe_account_id) {
      const totalFee = itemMeta.reduce((sum, i) => sum + i.platformFee, 0)
      paymentIntentData = {
        application_fee_amount: totalFee,
        transfer_data: { destination: orgSettings.stripe_account_id },
      }
    }
  }
  // Multi-coach/org: platform collects, transfers dispatched per-coach in webhook

  // Encode cart items into Stripe session metadata for webhook reconstruction
  const metadata: Record<string, string> = {
    athlete_id: athleteId,
    checkout_type: 'cart',
    item_count: String(itemMeta.length),
    ...(subProfileId ? { sub_profile_id: subProfileId } : {}),
    athlete_label:
      (cartItems.find((item) => typeof item.athlete_label === 'string' && item.athlete_label.trim())?.athlete_label || 'Primary athlete'),
  }
  itemMeta.forEach((item, i) => {
    // Format: productId|qty|coachId|orgId|amountCents|platformFee|netAmount|stripeAccountId
    metadata[`item_${i}`] = [
      item.productId,
      item.qty,
      item.coachId || '',
      item.orgId || '',
      item.amountCents,
      item.platformFee,
      item.netAmount,
      item.stripeAccountId || '',
    ].join('|')
  })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/athlete/marketplace/orders?cart_checkout=success`,
      cancel_url: `${origin}/athlete/marketplace/cart`,
      client_reference_id: athleteId,
      ...(profileData?.stripe_customer_id ? { customer: profileData.stripe_customer_id } : {}),
      ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
      metadata,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to create checkout session', 500)
  }
}
