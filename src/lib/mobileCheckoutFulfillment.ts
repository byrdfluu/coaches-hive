import type Stripe from 'stripe'
import { completeMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import {
  sendLegacyMarketplaceOrderEmails,
  sendMobileMarketplaceOrderEmails,
} from '@/lib/marketplaceOrderEmails'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadOrgCommercialTerms } from '@/lib/orgCommercialTerms'

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
  metadata.payment_record_id
  || metadata.league_fee_assignment_id
  || metadata.assignment_id
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

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  })
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
  const baseAmountCents = Math.max(0, Math.round(Number(metadata.baseAmountCents ?? grossAmountCents)))
  const serviceFeeCents = Math.max(0, Math.round(Number(metadata.serviceFeeCents ?? 0)))
  const totalAmountCents = Math.max(0, Math.round(Number(metadata.totalAmountCents ?? grossAmountCents)))
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
  const netAmountCents = Math.max(0, Math.round(Number(metadata.organizationNetCents ?? (baseAmountCents - platformFeeCents))))
  const latestCharge = intent.latest_charge && typeof intent.latest_charge !== 'string'
    ? intent.latest_charge as Stripe.Charge
    : null
  const balanceTransaction = latestCharge?.balance_transaction && typeof latestCharge.balance_transaction !== 'string'
    ? latestCharge.balance_transaction as Stripe.BalanceTransaction
    : null
  const stripeProcessingFeeCents = balanceTransaction?.fee == null ? null : Math.max(0, Math.round(balanceTransaction.fee))
  const paymentMethodType = latestCharge?.payment_method_details?.type || 'pending'
  const paymentRecordId = paymentRecordIdForSession(metadata)
  const metadataWorkspaceId = String(metadata.workspace_id || '').trim() || null
  const workspaceId = metadataWorkspaceId || (destination
    ? (await supabaseAdmin.from('stripe_connect_accounts').select('workspace_id')
        .eq('stripe_account_id', destination).maybeSingle()).data?.workspace_id || null
    : null)
  const organizationId = String(metadata.orgId || metadata.org_id || '').trim() || (destination
    ? (await supabaseAdmin.from('stripe_connect_accounts').select('org_id').eq('stripe_account_id', destination).maybeSingle()).data?.org_id || null
    : null)
  const commercialTerms = organizationId ? await loadOrgCommercialTerms(organizationId) : null
  const processingFeeResponsibility = commercialTerms?.processingResponsibility || 'platform_absorbs_processing'
  const coachesHiveNetAmountCents = platformFeeCents + serviceFeeCents - (stripeProcessingFeeCents || 0)

  const { error } = await supabaseAdmin
    .from('stripe_connect_payment_accounting')
    .upsert({
      stripe_payment_intent_id: paymentIntentId,
      workspace_id: workspaceId,
      stripe_checkout_session_id: session.id,
      checkout_type: metadata.checkout_type || 'unknown',
      payment_record_id: paymentRecordId,
      gross_amount_cents: grossAmountCents,
      base_amount_cents: baseAmountCents,
      service_fee_cents: serviceFeeCents,
      total_amount_cents: totalAmountCents,
      organization_net_amount_cents: netAmountCents,
      payment_method_type: paymentMethodType,
      service_fee_refundable: false,
      payment_policy_version: metadata.paymentPolicyVersion || null,
      agreement_version: metadata.agreementVersion || null,
      platform_fee_cents: platformFeeCents,
      platform_fee_rate: platformFeeRate,
      connected_account_destination: destination,
      net_amount_cents: netAmountCents,
      recipient_net_amount_cents: netAmountCents,
      stripe_processing_fee_cents: stripeProcessingFeeCents,
      organization_id: organizationId,
      processing_fee_responsibility: processingFeeResponsibility,
      coaches_hive_net_amount_cents: coachesHiveNetAmountCents,
      stripe_charge_id: latestCharge?.id || null,
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
    stripeProcessingFeeCents,
  }
}

export const fulfillMobileCheckoutSession = async (session: Stripe.Checkout.Session) => {
  const metadata = (session.metadata || {}) as Record<string, string>
  const type = metadata.checkout_type
  if (!['org_fee', 'coach_fee', 'mobile_program', 'mobile_tryout', 'mobile_marketplace', 'mobile_onboarding', 'training_package', 'training_multi_session'].includes(type)) return false

  if (type !== 'mobile_onboarding') {
    await persistStripeConnectPaymentAccounting(session)
  }

  if(type==='training_multi_session'){
    if(session.status!=='complete'||(session.payment_status!=='paid'&&session.payment_status!=='no_payment_required'))return true
    if(!metadata.attempt_id)throw new Error('Training session checkout is missing attempt_id')
    const paymentIntentId=getId(session.payment_intent)
    const {data:attempt,error:attemptError}=await supabaseAdmin.from('org_training_multi_checkout_attempts').select('id,org_id,athlete_id,payer_user_id,base_amount_cents,stripe_checkout_session_id,status').eq('id',metadata.attempt_id).maybeSingle()
    if(attemptError)throw attemptError
    if(!attempt||attempt.stripe_checkout_session_id!==session.id)throw new Error('Training session checkout does not match its attempt')
    const {error}=await(supabaseAdmin as any).rpc('fulfill_org_training_multi_checkout',{p_attempt:attempt.id,p_session:session.id,p_payment_intent:paymentIntentId})
    if(error)throw error
    const{data:occurrences}=await supabaseAdmin.from('org_training_multi_checkout_occurrences').select('session_id,amount_cents,booking_id,org_training_sessions(title)').eq('attempt_id',attempt.id)
    const platformFee=Math.max(0,Number(metadata.platformFeeCents||0)),gross=Math.max(0,Number(session.amount_total||attempt.base_amount_cents))
    const occurrenceMetadata=(occurrences||[]).map((row:any)=>({occurrence_id:row.session_id,booking_id:row.booking_id,amount_cents:Number(row.amount_cents),title:(Array.isArray(row.org_training_sessions)?row.org_training_sessions[0]:row.org_training_sessions)?.title||'Training session'}))
    const {error:ledgerError}=await supabaseAdmin.from('payment_transactions').upsert({transaction_type:'training_session',status:'succeeded',org_id:attempt.org_id,payer_id:attempt.payer_user_id,athlete_profile_id:attempt.athlete_id,source_record_type:'org_training_multi_checkout',source_record_id:attempt.id,description:occurrenceMetadata.map(row=>row.title).join(', ')||'Training sessions',gross_amount_cents:gross,amount_cents:gross,base_amount_cents:attempt.base_amount_cents,service_fee_cents:Math.max(0,gross-Number(attempt.base_amount_cents)),total_amount_cents:gross,platform_fee_cents:platformFee,net_amount_cents:Math.max(0,Number(attempt.base_amount_cents)-platformFee),net_cents:Math.max(0,Number(attempt.base_amount_cents)-platformFee),organization_net_cents:Math.max(0,Number(attempt.base_amount_cents)-platformFee),organization_net_amount_cents:Math.max(0,Number(attempt.base_amount_cents)-platformFee),coaches_hive_net_cents:platformFee+Math.max(0,gross-Number(attempt.base_amount_cents)),currency:String(session.currency||'usd'),stripe_payment_intent_id:paymentIntentId,occurred_at:new Date().toISOString(),metadata:{checkout_session_id:session.id,occurrence_checkout_attempt_id:attempt.id,occurrences:occurrenceMetadata}},{onConflict:'stripe_payment_intent_id'})
    if(ledgerError)throw ledgerError
    return true
  }

  if (type === 'training_package') {
    if (session.status !== 'complete') return true
    if (session.mode === 'payment' && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return true
    if (!metadata.purchase_id) throw new Error('Training package checkout is missing purchase_id')
    const { data: purchase, error: purchaseError } = await supabaseAdmin.from('org_training_package_purchases')
      .select('id,stripe_checkout_session_id').eq('id', metadata.purchase_id).maybeSingle()
    if (purchaseError) throw purchaseError
    if (!purchase || purchase.stripe_checkout_session_id !== session.id) throw new Error('Training package purchase does not match Stripe session')
    const subscriptionId = getId(session.subscription)
    const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) as any : null
    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
    const invoiceId = getId(subscription?.latest_invoice)
    const paymentIntentId = getId(session.payment_intent)
    const cycleKey = invoiceId || paymentIntentId || session.id
    const { error } = await supabaseAdmin.rpc('activate_org_training_purchase', {
      p_purchase_id: metadata.purchase_id,
      p_payment_record_id: metadata.purchase_id,
      p_stripe_subscription_id: subscriptionId,
      p_current_period_end: periodEnd,
      p_cycle_key: cycleKey,
      p_stripe_invoice_id: invoiceId,
    })
    if (error) throw error
    if (subscription) {
      const { error: subscriptionStateError } = await supabaseAdmin.from('org_training_package_purchases').update({
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        updated_at: new Date().toISOString(),
      }).eq('id', metadata.purchase_id)
      if (subscriptionStateError) throw subscriptionStateError
    }
    return true
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
      const paymentIntent = paymentIntentId
        ? (typeof session.payment_intent === 'object' && session.payment_intent
          ? session.payment_intent as Stripe.PaymentIntent
          : await stripe.paymentIntents.retrieve(paymentIntentId))
        : null
      const baseAmountCents = Number(paymentIntent?.metadata?.baseAmountCents || metadata.baseAmountCents || 0)
      if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
        throw new Error('Tryout checkout is missing its authoritative base amount')
      }
      const { error } = await supabaseAdmin.rpc('complete_tryout_registration', {
        registration_id: metadata.registration_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        // Checkout includes the separately disclosed Coaches Hive fee. The
        // fulfillment RPC validates the organization's base tryout price.
        paid_amount: baseAmountCents / 100,
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
      paid_amount: Number(metadata.baseAmountCents || session.amount_total || 0) / 100,
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
  // Fulfillment RPCs validate the seller's base price. The Checkout total may
  // also contain the separately disclosed, non-refundable service fee.
  const paidAmount = Number(
    type === 'org_fee' || type === 'mobile_marketplace'
      ? (metadata.baseAmountCents || session.amount_total || 0)
      : (session.amount_total || 0),
  ) / 100
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
      // Marketplace accounting is created before fulfillment so a webhook
      // failure can never create an order without its financial record. Once
      // the idempotent order RPC returns, replace the provisional item ID with
      // the authoritative order ID used by the admin revenue ledger.
      if (paymentIntentId) {
        const { error: accountingOrderError } = await supabaseAdmin
          .from('stripe_connect_payment_accounting')
          .update({ payment_record_id: orderId, updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', paymentIntentId)
        if (accountingOrderError) throw accountingOrderError
      }
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
  if (Number(metadata.baseAmountCents || intent.amount_received || intent.amount) !== expectedCents) {
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
