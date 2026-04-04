import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_MARKETPLACE_FEE } from '@/lib/orgPricing'
import { FeeTier, getFeePercentage, resolveProductCategory } from '@/lib/platformFees'
import { sendMarketplaceOrderConfirmationEmail, sendMarketplaceNewOrderSellerEmail } from '@/lib/email'
import { isEmailEnabled, isPushEnabled } from '@/lib/notificationPrefs'
import { checkGuardianApproval, guardianApprovalBlockedResponse } from '@/lib/guardianApproval'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { product_id, payment_intent_id, shipping_address } = body || {}

  if (!product_id) {
    return jsonError('product_id is required')
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, coach_id, org_id, price, price_cents, inventory_count, shipping_required, type, category')
    .eq('id', product_id)
    .maybeSingle()

  if (!product) {
    return jsonError('Product not found', 404)
  }

  const guardianTargetType = product.org_id ? 'org' : product.coach_id ? 'coach' : null
  const guardianTargetId = product.org_id || product.coach_id || ''
  if (role === 'athlete' && guardianTargetType && guardianTargetId) {
    const guardianCheck = await checkGuardianApproval({
      athleteId: session.user.id,
      targetType: guardianTargetType,
      targetId: String(guardianTargetId),
      scope: 'transactions',
    })
    if (!guardianCheck.allowed) {
      return guardianApprovalBlockedResponse({
        scope: 'transactions',
        targetType: guardianTargetType,
        targetId: String(guardianTargetId),
        pending: guardianCheck.pending,
        approvalId: guardianCheck.approvalId,
      })
    }
  }

  if (product.inventory_count !== null && product.inventory_count !== undefined) {
    const remaining = Number(product.inventory_count)
    if (Number.isFinite(remaining) && remaining <= 0) {
      return jsonError('This item is out of stock.', 400)
    }
  }

  if (product.shipping_required && !shipping_address) {
    return jsonError('shipping_address is required')
  }

  const amount = product.price_cents ? product.price_cents / 100 : Number(product.price || 0)

  const category = resolveProductCategory(product.type || product.category)
  let platformFeeRate = ORG_MARKETPLACE_FEE
  if (product.coach_id) {
    const { data: planRow } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', product.coach_id)
      .maybeSingle()
    const { data: feeRuleRows } = await supabaseAdmin
      .from('platform_fee_rules')
      .select('tier, category, percentage')
      .eq('active', true)
    const tier = (planRow?.tier as FeeTier) || 'starter'
    platformFeeRate = getFeePercentage(tier, category, feeRuleRows || [])
  }
  const platformFee = Number((amount * (platformFeeRate / 100)).toFixed(2))
  const netAmount = Number((amount - platformFee).toFixed(2))

  let resolvedOrgId = product.org_id
  if (!resolvedOrgId && product.coach_id) {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', product.coach_id)
      .maybeSingle()
    resolvedOrgId = membership?.org_id || null
  }

  const isDigital = !product.shipping_required
    || String(product.type || '').toLowerCase().includes('digital')
    || String(product.category || '').toLowerCase().includes('digital')
  const nowIso = new Date().toISOString()

  const { data: orderRow, error: insertError } = await supabaseAdmin
    .from('orders')
    .insert({
      athlete_id: session.user.id,
      product_id: product.id,
      coach_id: product.coach_id,
      org_id: resolvedOrgId,
      status: 'Paid',
      amount,
      platform_fee: platformFee,
      platform_fee_rate: platformFeeRate,
      net_amount: netAmount,
      payment_intent_id: payment_intent_id || null,
      shipping_address: shipping_address || null,
      fulfillment_status: isDigital ? 'delivered' : 'unfulfilled',
      delivered_at: isDigital ? nowIso : null,
    })
    .select('*')
    .single()

  if (insertError) {
    return jsonError(insertError.message)
  }

  const { data: receiptRow } = await supabaseAdmin.from('payment_receipts').insert({
    payer_id: session.user.id,
    payee_id: product.coach_id,
    org_id: resolvedOrgId,
    order_id: orderRow.id,
    amount,
    currency: 'usd',
    status: 'paid',
      stripe_payment_intent_id: payment_intent_id || null,
      metadata: {
        source: 'marketplace',
        product_id: product.id,
        product_type: product.type || product.category || null,
        platform_fee: platformFee,
        platform_fee_rate: platformFeeRate,
        net_amount: netAmount,
      },
  }).select('id').maybeSingle()

  const { data: buyerProfile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, notification_prefs')
    .eq('id', session.user.id)
    .maybeSingle()

  if (buyerProfile?.email && isEmailEnabled(buyerProfile?.notification_prefs, 'marketplace')) {
    await sendMarketplaceOrderConfirmationEmail({
      toEmail: buyerProfile.email,
      toName: buyerProfile.full_name,
      productName: product.type || product.category || 'your purchase',
      amount,
      currency: 'usd',
      orderId: orderRow.id,
      dashboardUrl: '/athlete/marketplace/orders',
    })
  }

  const formattedAmount = `$${amount.toFixed(2).replace(/\\.00$/, '')}`
  if (isPushEnabled(buyerProfile?.notification_prefs, 'marketplace')) {
    await supabaseAdmin.from('notifications').insert({
      user_id: session.user.id,
      type: 'marketplace_order',
      title: 'Order confirmed',
      body: `Your order for ${formattedAmount} is confirmed.`,
      action_url: '/athlete/marketplace',
      data: { order_id: orderRow.id, category: 'Marketplace' },
    })
  }

  if (product.coach_id) {
    const { data: coachProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, notification_prefs')
      .eq('id', product.coach_id)
      .maybeSingle()
    if (coachProfile?.email && isEmailEnabled(coachProfile?.notification_prefs, 'marketplace')) {
      await sendMarketplaceNewOrderSellerEmail({
        toEmail: coachProfile.email,
        toName: coachProfile.full_name,
        productName: product.type || product.category || 'your product',
        buyerName: buyerProfile?.full_name,
        amount,
        currency: 'usd',
        orderId: orderRow.id,
        dashboardUrl: '/coach/marketplace',
      })
    }
    if (isPushEnabled(coachProfile?.notification_prefs, 'marketplace')) {
      await supabaseAdmin.from('notifications').insert({
        user_id: product.coach_id,
        type: 'marketplace_order',
        title: 'New marketplace order',
        body: `New order for ${formattedAmount} on your marketplace.`,
        action_url: '/coach/marketplace',
        data: { order_id: orderRow.id, category: 'Marketplace' },
      })
    }
  }

  if (product.inventory_count !== null && product.inventory_count !== undefined) {
    const remaining = Number(product.inventory_count)
    if (Number.isFinite(remaining)) {
      await supabaseAdmin
        .from('products')
        .update({ inventory_count: Math.max(remaining - 1, 0) })
        .eq('id', product.id)
    }
  }

  return NextResponse.json({ order: orderRow })
}
