import type Stripe from 'stripe'
import { completeMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import {
  sendLegacyMarketplaceOrderEmails,
  sendMobileMarketplaceOrderEmails,
} from '@/lib/marketplaceOrderEmails'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const getId = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return null
}

const getDestinationId = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id)
  }
  return null
}

const paymentRecordIdForSession = (metadata: Record<string, string>) =>
  metadata.assignment_id
  || metadata.registration_id
  || metadata.item_id
  || null

const receiptUrlForSession = async (session: Stripe.Checkout.Session) => {
  const paymentIntentId = getId(session.payment_intent)
  if (!paymentIntentId) return null
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  })
  const latestCharge = intent.latest_charge
  if (!latestCharge) return null
  const charge = typeof latestCharge === 'string'
    ? await stripe.charges.retrieve(latestCharge)
    : latestCharge
  return charge.receipt_url || null
}

export const persistStripeConnectPaymentAccounting = async (session: Stripe.Checkout.Session) => {
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return null

  const paymentIntentId = getId(session.payment_intent)
  if (!paymentIntentId) return null

  const intent = typeof session.payment_intent === 'object' && session.payment_intent
    ? session.payment_intent as Stripe.PaymentIntent
    : await stripe.paymentIntents.retrieve(paymentIntentId)
  const metadata = {
    ...((intent.metadata || {}) as Record<string, string>),
    ...((session.metadata || {}) as Record<string, string>),
  }
  const destination = getDestinationId(intent.transfer_data?.destination)

  // Subscription and platform-only payments intentionally have no connected
  // account destination and do not belong in the Connect payment ledger.
  if (!destination) return null

  const grossAmountCents = Math.max(
    0,
    Math.round(Number(session.amount_total ?? intent.amount_received ?? intent.amount ?? 0)),
  )
  const platformFeeCents = Math.max(
    0,
    Math.round(Number(metadata.platformFeeCents ?? intent.application_fee_amount ?? 0)),
  )
  const platformFeeRateFromMetadata = Number(metadata.platformFeeRate)
  const platformFeeRate = Number.isFinite(platformFeeRateFromMetadata)
    ? platformFeeRateFromMetadata
    : grossAmountCents > 0
      ? (platformFeeCents / grossAmountCents) * 100
      : 0
  const netAmountFromMetadata = Number(metadata.netAmountCents)
  const netAmountCents = Number.isFinite(netAmountFromMetadata)
    ? Math.max(0, Math.round(netAmountFromMetadata))
    : Math.max(0, grossAmountCents - platformFeeCents)
  const paymentRecordId = paymentRecordIdForSession(metadata)
  const metadataWorkspaceId = String(metadata.workspace_id || '').trim() || null
  const workspaceId = metadataWorkspaceId || (destination
    ? (await supabaseAdmin.from('stripe_connect_accounts').select('workspace_id')
        .eq('stripe_account_id', destination).maybeSingle()).data?.workspace_id || null
    : null)

  const { error } = await supabaseAdmin
    .from('stripe_connect_payment_accounting')
    .upsert({
      stripe_payment_intent_id: paymentIntentId,
      workspace_id: workspaceId,
      stripe_checkout_session_id: session.id,
      checkout_type: metadata.checkout_type || 'unknown',
      payment_record_id: paymentRecordId,
      gross_amount_cents: grossAmountCents,
      platform_fee_cents: platformFeeCents,
      platform_fee_rate: platformFeeRate,
      connected_account_destination: destination,
      net_amount_cents: netAmountCents,
      currency: String(session.currency || intent.currency || 'usd').toLowerCase(),
      livemode: Boolean(intent.livemode),
      stripe_metadata: metadata,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_payment_intent_id' })
  if (error) {
    // Keep payment fulfillment available during a staggered web/database
    // deployment. Once the accounting migration is installed, webhook retries
    // will idempotently backfill the ledger by PaymentIntent ID.
    if (error.code === '42P01') {
      console.error('[mobileCheckoutFulfillment] Connect accounting migration is not installed')
      return null
    }
    throw error
  }

  return {
    paymentIntentId,
    grossAmountCents,
    platformFeeCents,
    platformFeeRate,
    destination,
    netAmountCents,
  }
}

export const fulfillMobileCheckoutSession = async (session: Stripe.Checkout.Session) => {
  const metadata = (session.metadata || {}) as Record<string, string>
  const type = metadata.checkout_type
  if (!['org_fee', 'coach_fee', 'mobile_program', 'mobile_tryout', 'mobile_marketplace', 'mobile_onboarding'].includes(type)) return false

  if (type !== 'mobile_onboarding') {
    await persistStripeConnectPaymentAccounting(session)
  }

  if (type === 'coach_fee' || type === 'mobile_program' || type === 'mobile_tryout') {
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return true
    const paymentIntentId = getId(session.payment_intent)
    if (type === 'coach_fee') {
      if (!metadata.assignment_id) throw new Error('Coach fee checkout is missing assignment_id')
      const receiptUrl = await receiptUrlForSession(session)
      const { data, error } = await supabaseAdmin
        .from('coach_fee_assignments')
        .update({
          status: 'paid',
          stripe_payment_intent_id: paymentIntentId,
          receipt_url: receiptUrl,
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

    if (!metadata.registration_id) throw new Error(`${type === 'mobile_tryout' ? 'Tryout' : 'Program'} checkout is missing registration_id`)
    if (type === 'mobile_tryout') {
      const { data: boundRegistration, error: boundError } = await supabaseAdmin
        .from('org_tryout_registrations')
        .select('id')
        .eq('id', metadata.registration_id)
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle()
      if (boundError) throw boundError
      if (!boundRegistration) throw new Error('Tryout registration does not match Stripe session')
      const { error } = await supabaseAdmin.rpc('complete_tryout_registration', {
        registration_id: metadata.registration_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        paid_amount: Number(session.amount_total || 0) / 100,
      })
      if (error) throw error
      return true
    }
    const receiptUrl = await receiptUrlForSession(session)
    const { data, error } = await supabaseAdmin
      .from('program_registrations')
      .update({
        status: 'paid',
        stripe_payment_intent_id: paymentIntentId,
        receipt_url: receiptUrl,
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

  // The current mobile contract creates organization-fee Checkout Sessions
  // directly from POST /api/mobile/checkout. Older clients may still use a
  // signed handoff nonce, which continues through the legacy branch below.
  if (type === 'org_fee' && !metadata.handoff_nonce) {
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return true
    if (!metadata.assignment_id) throw new Error('Organization fee checkout is missing assignment_id')
    const { data: boundAssignment, error: boundAssignmentError } = await supabaseAdmin
      .from('org_fee_assignments')
      .select('id')
      .eq('id', metadata.assignment_id)
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle()
    if (boundAssignmentError) throw boundAssignmentError
    if (!boundAssignment) throw new Error('Organization fee assignment does not match Stripe session')
    const paymentIntentId = getId(session.payment_intent)
    const receiptUrl = await receiptUrlForSession(session)
    const { error } = await supabaseAdmin.rpc('complete_fee_payment', {
      assignment_id: metadata.assignment_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_amount: Number(session.amount_total || 0) / 100,
    })
    if (error) throw error
    if (receiptUrl) {
      const { error: receiptError } = await supabaseAdmin.from('org_fee_assignments')
        .update({ receipt_url: receiptUrl })
        .eq('id', metadata.assignment_id)
        .eq('stripe_checkout_session_id', session.id)
      if (receiptError) throw receiptError
    }
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
    const receiptUrl = await receiptUrlForSession(session)
    const { error } = await supabaseAdmin.rpc('complete_fee_payment', {
      assignment_id: metadata.assignment_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_amount: paidAmount,
    })
    if (error) throw error
    if (receiptUrl) {
      const { error: receiptError } = await supabaseAdmin.from('org_fee_assignments')
        .update({ receipt_url: receiptUrl })
        .eq('id', metadata.assignment_id)
        .eq('stripe_checkout_session_id', session.id)
      if (receiptError) throw receiptError
    }
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
  if (session.metadata?.checkout_type === 'coach_fee') {
    const assignmentId = session.metadata.assignment_id
    if (!assignmentId) throw new Error('Expired coach fee checkout is missing assignment_id')
    const { error } = await supabaseAdmin
      .from('coach_fee_assignments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .eq('stripe_checkout_session_id', session.id)
      .eq('status', 'pending')
    if (error) throw error
    return true
  }

  if (session.metadata?.checkout_type === 'org_fee') {
    const assignmentId = session.metadata.assignment_id
    if (!assignmentId) throw new Error('Expired organization fee checkout is missing assignment_id')
    const { error } = await supabaseAdmin.from('org_fee_assignments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', assignmentId).eq('stripe_checkout_session_id', session.id).neq('status', 'paid')
    if (error) throw error
    return true
  }

  if (session.metadata?.checkout_type === 'mobile_program') {
    const registrationId = session.metadata.registration_id
    if (!registrationId) throw new Error('Expired program checkout is missing registration_id')
    const { error } = await supabaseAdmin.from('program_registrations')
      .update({ status: 'expired' })
      .eq('id', registrationId).eq('stripe_checkout_session_id', session.id).eq('status', 'pending')
    if (error) throw error
    return true
  }

  if (session.metadata?.checkout_type === 'mobile_tryout') {
    const registrationId = session.metadata.registration_id
    if (!registrationId) throw new Error('Expired tryout checkout is missing registration_id')
    const { error } = await supabaseAdmin.from('org_tryout_registrations')
      .update({ status: 'expired' })
      .eq('id', registrationId).eq('stripe_checkout_session_id', session.id).eq('status', 'pending')
    if (error) throw error
    return true
  }

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
