import type Stripe from 'stripe'
import { completeMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import {
  sendLegacyMarketplaceOrderEmails,
  sendMobileMarketplaceOrderEmails,
} from '@/lib/marketplaceOrderEmails'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const getId = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return null
}

export const fulfillMobileCheckoutSession = async (session: Stripe.Checkout.Session) => {
  const metadata = (session.metadata || {}) as Record<string, string>
  const type = metadata.checkout_type
  if (!['org_fee', 'coach_fee', 'mobile_program', 'mobile_marketplace', 'mobile_onboarding'].includes(type)) return false

  if (type === 'coach_fee' || type === 'mobile_program') {
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return true
    const paymentIntentId = getId(session.payment_intent)
    if (type === 'coach_fee') {
      if (!metadata.assignment_id) throw new Error('Coach fee checkout is missing assignment_id')
      const { data, error } = await supabaseAdmin
        .from('coach_fee_assignments')
        .update({
          status: 'paid',
          stripe_payment_intent_id: paymentIntentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', metadata.assignment_id)
        .eq('stripe_checkout_session_id', session.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Coach fee assignment does not match Stripe session')
      return true
    }

    if (!metadata.registration_id) throw new Error('Program checkout is missing registration_id')
    const { data, error } = await supabaseAdmin
      .from('program_registrations')
      .update({
        status: 'paid',
        stripe_payment_intent_id: paymentIntentId,
        registered_at: new Date().toISOString(),
      })
      .eq('id', metadata.registration_id)
      .eq('stripe_checkout_session_id', session.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Program registration does not match Stripe session')
    return true
  }

  const nonce = metadata.handoff_nonce
  if (!nonce) throw new Error('Mobile checkout is missing handoff_nonce')
  const { data: handoff } = await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .select('nonce, user_id, checkout_type, resource_id, status')
    .eq('nonce', nonce)
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()
  if (!handoff) throw new Error('Mobile checkout handoff does not match Stripe session')
  if (handoff.status === 'fulfilled') return true

  if (type === 'mobile_onboarding') {
    if (session.status !== 'complete') throw new Error('Subscription checkout is not complete')
    await completeMobileHandoff(nonce)
    return true
  }

  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return true
  }

  const paymentIntentId = getId(session.payment_intent)
  const paidAmount = Number(session.amount_total || 0) / 100
  if (type === 'org_fee') {
    if (!metadata.assignment_id || metadata.assignment_id !== handoff.resource_id) {
      throw new Error('Fee assignment does not match checkout handoff')
    }
    const { error } = await supabaseAdmin.rpc('complete_fee_payment', {
      assignment_id: metadata.assignment_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_amount: paidAmount,
    })
    if (error) throw error
  }

  if (type === 'mobile_marketplace') {
    if (!metadata.item_id || metadata.item_id !== handoff.resource_id || metadata.buyer_id !== handoff.user_id) {
      throw new Error('Marketplace order does not match checkout handoff')
    }
    const { data: orderId, error } = await supabaseAdmin.rpc('complete_marketplace_order', {
      item_id: metadata.item_id,
      buyer_id: metadata.buyer_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_amount: paidAmount,
    })
    if (error) throw error
    if (orderId) {
      await sendMobileMarketplaceOrderEmails({
        orderId,
        itemId: metadata.item_id,
        buyerId: metadata.buyer_id,
        amount: paidAmount,
        currency: session.currency || 'usd',
      }).catch((err: unknown) => console.error('[mobileCheckoutFulfillment] marketplace order email failed:', err))
    }
  }

  await completeMobileHandoff(nonce)
  return true
}

export const expireMobileCheckoutSession = async (session: Stripe.Checkout.Session) => {
  const nonce = session.metadata?.handoff_nonce
  if (!nonce) return false
  await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('nonce', nonce)
    .neq('status', 'fulfilled')
  return true
}

export const fulfillLegacyFeePaymentIntent = async (intent: Stripe.PaymentIntent) => {
  const metadata = intent.metadata || {}
  const assignmentId = metadata.assignmentId || metadata.assignment_id
  if (!assignmentId) return false
  const { error } = await supabaseAdmin.rpc('complete_fee_payment', {
    assignment_id: assignmentId,
    stripe_checkout_session_id: `payment_intent:${intent.id}`,
    stripe_payment_intent_id: intent.id,
    paid_amount: Number(intent.amount_received || intent.amount || 0) / 100,
  })
  if (error) throw error
  return true
}

export const fulfillLegacyMarketplacePaymentIntent = async (intent: Stripe.PaymentIntent) => {
  const metadata = intent.metadata || {}
  const productId = metadata.productId || metadata.product_id
  const athleteId = metadata.athleteId || metadata.athlete_id
  if (!productId || !athleteId || metadata.assignmentId || metadata.assignment_id) return false

  const { data: existing } = await supabaseAdmin
    .from('orders').select('id').eq('payment_intent_id', intent.id).maybeSingle()
  if (existing) return true

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, coach_id, org_id, price, price_cents, inventory_count, shipping_required, type, category')
    .eq('id', productId)
    .maybeSingle()
  if (!product) throw new Error('Paid marketplace product was not found')

  const expectedCents = product.price_cents
    ? Math.round(Number(product.price_cents))
    : Math.round(Number(product.price || 0) * 100)
  if (Number(intent.amount_received || intent.amount) !== expectedCents) {
    throw new Error('Paid amount does not match marketplace product price')
  }
  if (product.inventory_count !== null && Number(product.inventory_count) <= 0) {
    throw new Error('Paid marketplace product is out of stock')
  }

  const amount = expectedCents / 100
  const platformFee = Number(metadata.platformFeeCents || 0) / 100
  const netAmount = Number(metadata.netAmountCents || expectedCents - Number(metadata.platformFeeCents || 0)) / 100
  const digital = !product.shipping_required || String(product.type || product.category || '').toLowerCase().includes('digital')
  const now = new Date().toISOString()
  const { data: order, error } = await supabaseAdmin.from('orders').insert({
    athlete_id: athleteId,
    athlete_profile_id: metadata.athleteProfileId || null,
    sub_profile_id: metadata.subProfileId || null,
    product_id: product.id,
    coach_id: product.coach_id,
    org_id: product.org_id,
    status: 'Paid',
    amount,
    platform_fee: platformFee,
    net_amount: netAmount,
    payment_intent_id: intent.id,
    fulfillment_status: digital ? 'delivered' : 'unfulfilled',
    delivered_at: digital ? now : null,
  }).select('id').maybeSingle()
  if (error) {
    if (error.code === '23505') return true
    throw error
  }

  if (order?.id) {
    await supabaseAdmin.from('payment_receipts').insert({
      payer_id: athleteId,
      payee_id: product.coach_id,
      org_id: product.org_id,
      order_id: order.id,
      amount,
      currency: intent.currency || 'usd',
      status: 'paid',
      stripe_payment_intent_id: intent.id,
      metadata: { source: 'marketplace_webhook', product_id: product.id },
    })
    await sendLegacyMarketplaceOrderEmails({
      orderId: order.id,
      productId: product.id,
      buyerId: athleteId,
      coachId: product.coach_id,
      orgId: product.org_id,
      amount,
      currency: intent.currency || 'usd',
    }).catch((err: unknown) => console.error('[mobileCheckoutFulfillment] legacy marketplace order email failed:', err))
  }
  if (product.inventory_count !== null) {
    await supabaseAdmin.from('products').update({ inventory_count: Math.max(Number(product.inventory_count) - 1, 0) }).eq('id', product.id)
  }
  return true
}
