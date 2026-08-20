import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPaymentReceiptEmail, sendSubscriptionPaymentFailedEmail, sendSubscriptionUpdatedEmail } from '@/lib/email'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
import { roleToPath } from '@/lib/roleRedirect'
import { queueOperationTaskSafely } from '@/lib/operations'
import { getPostHogClient } from '@/lib/posthog-server'
import { sendLegacyMarketplaceOrderEmails } from '@/lib/marketplaceOrderEmails'
import {
  getOrderDisputeRefundStatus,
  resolveStripeBillingRole,
  resolveStripeSubscriptionContext,
} from '@/lib/stripeWebhookHelpers'
import { syncStripeConnectAccountByStripeId } from '@/lib/stripeConnectAccounts'
import {
  expireMobileCheckoutSession,
  fulfillLegacyFeePaymentIntent,
  fulfillLegacyMarketplacePaymentIntent,
  fulfillMobileCheckoutSession,
  persistStripeConnectPaymentAccounting,
} from '@/lib/mobileCheckoutFulfillment'
import { handleStripeRefundEvent } from '@/lib/refundRequests'
import { syncPaymentIntentToLedger } from '@/lib/paymentLedger'

export const runtime = 'nodejs'

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set — webhook signature verification will fail at runtime')
}

type BillingRole = 'coach' | 'athlete' | 'org'

const normalizeTierForRole = (role: BillingRole, tier?: string | null) => {
  if (role === 'coach') return 'individual_coach'
  if (role === 'athlete') return normalizeAthleteTier(tier)
  return 'organization'
}

const mapSubscriptionStatusToOrgStatus = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return normalizeOrgStatus('active')
  if (normalized === 'trialing') return normalizeOrgStatus('trialing')
  if (normalized === 'canceled') return normalizeOrgStatus('canceled')
  if (
    normalized === 'past_due'
    || normalized === 'unpaid'
    || normalized === 'incomplete'
    || normalized === 'incomplete_expired'
    || normalized === 'paused'
  ) {
    return normalizeOrgStatus('past_due')
  }
  return normalizeOrgStatus('trialing')
}

const loadUserForCustomer = async (customerId: string) => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return profile || null
}

const loadOrgForUser = async (userId: string) => {
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle()
  return membership?.org_id || null
}

const syncSubscriptionState = async (payload: {
  userId?: string | null
  billingRole?: BillingRole | null
  tier?: string | null
  customerId?: string | null
  subscriptionStatus?: string | null
  orgId?: string | null
  subscriptionId?: string | null
  currentPeriodStart?: number | null
  currentPeriodEnd?: number | null
  trialEnd?: number | null
  cancelAtPeriodEnd?: boolean | null
  billingInterval?: string | null
  stripePriceId?: string | null
  stripeSubscriptionItemId?: string | null
  stripeCoachSeatItemId?: string | null
  renewalAmountCents?: number | null
  purchaseChannel?: string | null
}) => {
  let resolvedUserId = payload.userId || null
  let resolvedRole = payload.billingRole || null

  if ((!resolvedUserId || !resolvedRole) && payload.customerId) {
    const profile = await loadUserForCustomer(payload.customerId)
    if (profile?.id) {
      resolvedUserId = resolvedUserId || profile.id
      resolvedRole = resolvedRole || resolveStripeBillingRole(profile.role)
    }
  }

  if (!resolvedUserId) return

  const normalizedTier =
    payload.tier && resolvedRole
      ? normalizeTierForRole(resolvedRole, payload.tier)
      : null

  const isCanceled = payload.subscriptionStatus === 'canceled' || payload.subscriptionStatus === 'cancelled'

  if (resolvedRole === 'coach') {
    if (isCanceled) {
      await supabaseAdmin.from('coach_plans').delete().eq('coach_id', resolvedUserId)
    } else if (normalizedTier) {
      await supabaseAdmin
        .from('coach_plans')
        .upsert({ coach_id: resolvedUserId, tier: normalizedTier }, { onConflict: 'coach_id' })
    }
  }

  if (resolvedRole === 'athlete') {
    if (isCanceled) {
      await supabaseAdmin.from('athlete_plans').delete().eq('athlete_id', resolvedUserId)
    } else if (normalizedTier) {
      await supabaseAdmin
        .from('athlete_plans')
        .upsert({ athlete_id: resolvedUserId, tier: normalizedTier }, { onConflict: 'athlete_id' })
    }
  }

  if (payload.customerId || payload.subscriptionStatus || normalizedTier) {
    const updates: Record<string, string> = {}
    if (payload.customerId) updates.stripe_customer_id = payload.customerId
    if (payload.subscriptionStatus) updates.subscription_status = payload.subscriptionStatus
    if (normalizedTier) updates.plan_tier = normalizedTier
    if (Object.keys(updates).length > 0) {
      const { error: profileUpdateError } = await supabaseAdmin.from('profiles').update(updates).eq('id', resolvedUserId)
      if (profileUpdateError) {
        console.error('[stripe/webhook] profiles update error:', profileUpdateError.message, { resolvedUserId, updates })
      }
    }
  }

  if (resolvedRole === 'org') {
    const resolvedOrgId = payload.orgId || (await loadOrgForUser(resolvedUserId))
    if (!resolvedOrgId) return
    const orgUpdates: Record<string, string> = { org_id: resolvedOrgId }
    if (normalizedTier) {
      orgUpdates.plan = normalizedTier
    }
    if (payload.subscriptionStatus) {
      orgUpdates.plan_status = mapSubscriptionStatusToOrgStatus(payload.subscriptionStatus)
    }
    await supabaseAdmin
      .from('org_settings')
      .upsert(orgUpdates, { onConflict: 'org_id' })
  }

  if ((resolvedRole === 'coach' || resolvedRole === 'athlete' || resolvedRole === 'org') && payload.subscriptionStatus) {
    const resolvedOrgId = resolvedRole === 'org' ? (payload.orgId || (await loadOrgForUser(resolvedUserId))) : null
    const ownerId = resolvedRole === 'org' ? resolvedOrgId : resolvedUserId
    if (ownerId) {
      const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('id')
        .eq(resolvedRole === 'org' ? 'organization_id' : 'owner_user_id', ownerId)
        .eq('workspace_type', resolvedRole === 'org' ? 'organization' : 'independent_coach')
        .maybeSingle()
      const canonicalStatus = String(payload.subscriptionStatus).toLowerCase() === 'cancelled'
        ? 'canceled'
        : String(payload.subscriptionStatus).toLowerCase()
      if (['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired'].includes(canonicalStatus)) {
        const { error } = await supabaseAdmin.from('platform_subscriptions').upsert({
          owner_type: resolvedRole,
          owner_id: ownerId,
          user_id: resolvedUserId,
          organization_id: resolvedOrgId,
          workspace_id: workspace?.id || null,
          stripe_customer_id: payload.customerId || null,
          stripe_subscription_id: payload.subscriptionId || null,
          tier: payload.tier || normalizedTier,
          plan_type: resolvedRole === 'coach' ? 'individual_coach' : resolvedRole === 'org' ? 'organization' : null,
          status: canonicalStatus,
          current_period_start: stripeUnixToIso(payload.currentPeriodStart),
          current_period_end: stripeUnixToIso(payload.currentPeriodEnd),
          trial_end: stripeUnixToIso(payload.trialEnd),
          cancel_at_period_end: Boolean(payload.cancelAtPeriodEnd),
          billing_interval: payload.billingInterval === 'year' ? 'year' : 'month',
          stripe_price_id: payload.stripePriceId || null,
          stripe_subscription_item_id: payload.stripeSubscriptionItemId || null,
          stripe_coach_seat_item_id: payload.stripeCoachSeatItemId || null,
          renewal_amount_cents: payload.renewalAmountCents || null,
          ...(payload.purchaseChannel ? { purchase_channel: payload.purchaseChannel } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'owner_type,owner_id' })
        if (error) throw new Error(error.message)
      }
    }
  }
}

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )


const upsertDispute = async (payload: {
  disputeId: string
  orderId?: string | null
  feeAssignmentId?: string | null
  paymentIntentId?: string | null
  chargeId?: string | null
  amount?: number | null
  currency?: string | null
  reason?: string | null
  status?: string | null
  evidenceDueBy?: number | null
}) => {
  const nowIso = new Date().toISOString()
  await supabaseAdmin
    .from('order_disputes')
    .upsert({
      dispute_id: payload.disputeId,
      order_id: payload.orderId || null,
      fee_assignment_id: payload.feeAssignmentId || null,
      payment_intent_id: payload.paymentIntentId || null,
      charge_id: payload.chargeId || null,
      amount: payload.amount ?? null,
      currency: payload.currency || null,
      reason: payload.reason || null,
      status: payload.status || null,
      evidence_due_by: payload.evidenceDueBy
        ? new Date(payload.evidenceDueBy * 1000).toISOString()
        : null,
      updated_at: nowIso,
    }, { onConflict: 'dispute_id' })
}

const getStripeObjectId = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in value && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

const stripeUnixToIso = (value?: number | null) => {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

const getCoachMembershipContext = (metadata: Record<string, string>) => {
  if (metadata.source !== 'coach_membership') return null
  const athleteId = metadata.athlete_id || metadata.user_id || null
  const coachId = metadata.coach_id || null
  const planId = metadata.membership_plan_id || null
  if (!athleteId || !coachId || !planId) return null
  return {
    athleteId,
    coachId,
    planId,
    includedSessions: Number.parseInt(metadata.included_sessions || '0', 10) || 0,
  }
}

const upsertCoachMembershipEntitlement = async (payload: {
  subscriptionRowId?: string | null
  coachId: string
  athleteId: string
  planId: string
  stripeSubscriptionId?: string | null
  includedSessions: number
  periodStart?: string | null
  periodEnd?: string | null
  source: string
}) => {
  if (!payload.subscriptionRowId || !payload.periodStart || !payload.periodEnd || payload.includedSessions <= 0) return

  const entitlementPayload = {
    subscription_id: payload.subscriptionRowId,
    coach_id: payload.coachId,
    athlete_id: payload.athleteId,
    entitlement_type: 'session_credit',
    quantity: payload.includedSessions,
    period_start: payload.periodStart,
    period_end: payload.periodEnd,
    metadata: {
      source: payload.source,
      membership_plan_id: payload.planId,
      stripe_subscription_id: payload.stripeSubscriptionId || null,
    },
  }

  const { data: existingEntitlement } = await supabaseAdmin
    .from('coach_membership_entitlements')
    .select('id')
    .eq('subscription_id', payload.subscriptionRowId)
    .eq('entitlement_type', 'session_credit')
    .eq('period_start', payload.periodStart)
    .maybeSingle()

  const { error } = existingEntitlement?.id
    ? await supabaseAdmin
      .from('coach_membership_entitlements')
      .update({
        ...entitlementPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingEntitlement.id)
    : await supabaseAdmin
      .from('coach_membership_entitlements')
      .insert({
        ...entitlementPayload,
        used_quantity: 0,
      })

  if (error) {
    console.error('[stripe/webhook] coach membership entitlement upsert error:', error.message)
  }
}

const syncCoachMembershipSubscription = async (payload: {
  subscription?: any
  checkoutSession?: any
  statusOverride?: string | null
  checkoutExpired?: boolean
  eventSource: string
}) => {
  const subscription = payload.subscription || null
  const checkoutSession = payload.checkoutSession || null
  const metadata = ((subscription?.metadata || checkoutSession?.metadata || {}) as Record<string, string>)
  const context = getCoachMembershipContext(metadata)
  if (!context) return false

  const subscriptionId = getStripeObjectId(subscription?.id || checkoutSession?.subscription)
  const customerId = getStripeObjectId(subscription?.customer || checkoutSession?.customer)
  const checkoutSessionId = checkoutSession?.id || null
  const status =
    payload.statusOverride
    || (payload.checkoutExpired ? 'expired' : null)
    || subscription?.status
    || 'active'
  const currentPeriodStart = stripeUnixToIso(subscription?.current_period_start)
  const currentPeriodEnd = stripeUnixToIso(subscription?.current_period_end)
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end)
  const canceledAt = stripeUnixToIso(subscription?.canceled_at)

  const effectiveStatus = status

  if (checkoutSessionId && payload.checkoutExpired && !subscriptionId) {
    const { error } = await supabaseAdmin
      .from('coach_membership_subscriptions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_checkout_session_id', checkoutSessionId)

    if (error) {
      console.error('[stripe/webhook] coach membership checkout expiration update error:', error.message)
    }
    return true
  }

  const { data: subscriptionRow, error } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .upsert(
      {
        plan_id: context.planId,
        coach_id: context.coachId,
        athlete_id: context.athleteId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_checkout_session_id: checkoutSessionId,
        status: effectiveStatus,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        canceled_at: canceledAt,
      },
      { onConflict: 'plan_id,athlete_id' },
    )
    .select('id')
    .single()

  if (error) {
    console.error('[stripe/webhook] coach membership subscription upsert error:', error.message)
    return true
  }

  if (customerId) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', context.athleteId)
    if (profileError) {
      console.error('[stripe/webhook] coach membership athlete customer sync error:', profileError.message)
    }
  }

  if (['active', 'trialing'].includes(String(effectiveStatus).toLowerCase())) {
    await upsertCoachMembershipEntitlement({
      subscriptionRowId: subscriptionRow?.id,
      coachId: context.coachId,
      athleteId: context.athleteId,
      planId: context.planId,
      stripeSubscriptionId: subscriptionId,
      includedSessions: context.includedSessions,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      source: payload.eventSource,
    })
  }

  getPostHogClient().capture({
    distinctId: context.athleteId,
    event: 'coach_membership_subscription_synced',
    properties: {
      coach_id: context.coachId,
      membership_plan_id: context.planId,
      stripe_subscription_id: subscriptionId,
      stripe_checkout_session_id: checkoutSessionId,
      subscription_status: status,
      event_source: payload.eventSource,
    },
  })

  return true
}

const retrieveSubscriptionForInvoice = async (invoice: any) => {
  const subscriptionId = getStripeObjectId(invoice.subscription || invoice.parent?.subscription_details?.subscription)
  if (!subscriptionId) return null
  return stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
}

// ---------------------------------------------------------------------------
// Per-event handlers — each handles one event type group
// ---------------------------------------------------------------------------

const handleRefundEvent = async (event: Stripe.Event) => {
  const refund = event.data.object as Stripe.Refund
  await handleStripeRefundEvent(event.type as 'refund.created' | 'refund.updated' | 'refund.failed', refund)
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id
  if (!chargeId || refund.status !== 'succeeded') return
  const charge = await stripe.charges.retrieve(chargeId)
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return
  const status = charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded'
  await supabaseAdmin.from('payment_transactions').update({
    status, refunded_amount_cents: charge.amount_refunded, updated_at: new Date().toISOString(),
  }).eq('stripe_payment_intent_id', paymentIntentId)
  await supabaseAdmin.from('payment_receipts').update({
    status, refund_amount: charge.amount_refunded / 100, refund_amount_cents: charge.amount_refunded,
    refunded_at: new Date().toISOString(),
  }).eq('stripe_payment_intent_id', paymentIntentId)
}

const handleChargeRefunded = async (event: Stripe.Event) => {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return
  const status = charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded'
  await supabaseAdmin.from('payment_transactions').update({ status, refunded_amount_cents: charge.amount_refunded, updated_at: new Date().toISOString() }).eq('stripe_payment_intent_id', paymentIntentId)
  await supabaseAdmin.from('payment_receipts').update({ status, refund_amount: charge.amount_refunded / 100, refund_amount_cents: charge.amount_refunded, refunded_at: new Date().toISOString() }).eq('stripe_payment_intent_id', paymentIntentId)
}

const handleAccountUpdated = async (event: Stripe.Event) => {
  const account = event.data.object as Stripe.Account
  await syncStripeConnectAccountByStripeId(account.id, account)
}

const handleCheckoutSessionCompleted = async (event: Stripe.Event) => {
  const session = event.data.object as any
  if (session.mode === 'subscription') {
    const metadata = (session.metadata || {}) as Record<string, string>
    if (metadata.source === 'coach_membership') {
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id || null
      let subscription = null
      if (subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
      }
      await syncCoachMembershipSubscription({
        subscription,
        checkoutSession: session,
        eventSource: 'checkout.session.completed',
      })
    } else {
      const userId = session.client_reference_id || metadata.user_id || null
      const billingRole = resolveStripeBillingRole(metadata.billing_role || metadata.role || null)
      const customerId = typeof session.customer === 'string' ? session.customer : null
      const orgId = metadata.org_id || null
      const tier = metadata.tier || null
      let subscriptionStatus = metadata.subscription_status || null
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id || null

      let retrievedSubscription: any = null
      if (subscriptionId) {
        try {
          retrievedSubscription = await stripe.subscriptions.retrieve(subscriptionId)
          subscriptionStatus = retrievedSubscription.status || subscriptionStatus
        } catch {
          // If retrieval fails, keep metadata/default state and continue.
        }
      }

      await syncSubscriptionState({
        userId,
        billingRole,
        tier,
        customerId,
        subscriptionStatus: subscriptionStatus || 'incomplete',
        orgId,
        subscriptionId,
        currentPeriodStart: retrievedSubscription?.current_period_start,
        currentPeriodEnd: retrievedSubscription?.current_period_end,
        trialEnd: retrievedSubscription?.trial_end,
        cancelAtPeriodEnd: retrievedSubscription?.cancel_at_period_end,
        purchaseChannel: 'stripe',
      })

      getPostHogClient().capture({
        distinctId: userId || (orgId ? `org:${orgId}` : customerId || 'subscription'),
        event: 'subscription_activated',
        properties: {
          billing_role: billingRole,
          tier,
          org_id: orgId || null,
          user_id: userId || null,
          customer_id: customerId || null,
          subscription_id: subscriptionId,
          subscription_status: subscriptionStatus || 'incomplete',
          gross_revenue: session.amount_total ? session.amount_total / 100 : 0,
          currency: session.currency || 'usd',
        },
      })
    }
  }

  if (session.mode === 'payment' && session.metadata?.checkout_type === 'cart') {
    await persistStripeConnectPaymentAccounting(session)
    const metadata = (session.metadata || {}) as Record<string, string>
    const athleteId = metadata.athlete_id || session.client_reference_id || null
    const itemCount = parseInt(metadata.item_count || '0', 10)
    const subProfileId = metadata.sub_profile_id || null
    const athleteLabel = metadata.athlete_label || 'Primary athlete'

    if (athleteId && itemCount > 0) {
      let chargeId: string | null = null
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null
      if (paymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
          chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge as any)?.id || null
        } catch { /* non-fatal */ }
      }

      const nowIso = new Date().toISOString()
      const createdOrderIds: string[] = []
      const hasTransferData = Boolean(session.payment_intent?.transfer_data?.destination)
      const sellerTransfers = new Map<string, { sellerType: 'coach' | 'org'; sellerId: string; stripeAccountId: string; netAmount: number; orderIds: string[] }>()

      for (let i = 0; i < itemCount; i++) {
        const raw = metadata[`item_${i}`]
        if (!raw) continue
        const parts = raw.split('|')
        const [productId, qtyStr, coachId, orgId, amountCentsStr, platformFeeStr, netAmountStr, stripeAccountId, sellerTypePart, sellerIdPart] = parts
        const sellerType: 'coach' | 'org' = sellerTypePart === 'org' ? 'org' : 'coach'
        const sellerId = sellerIdPart || coachId || orgId || null

        const qty = parseInt(qtyStr || '1', 10)
        const amountCents = parseInt(amountCentsStr || '0', 10)
        const platformFee = parseInt(platformFeeStr || '0', 10)
        const netAmount = parseInt(netAmountStr || '0', 10)

        if (!productId || !amountCents) continue

        const amount = amountCents / 100
        const platformFeeDecimal = platformFee / 100
        const netAmountDecimal = netAmount / 100
        const platformFeeRate = amount > 0 ? (platformFeeDecimal / amount) * 100 : 0

        const { data: existingOrder } = paymentIntentId
          ? await supabaseAdmin
              .from('orders')
              .select('id')
              .eq('payment_intent_id', paymentIntentId)
              .eq('product_id', productId)
              .maybeSingle()
          : { data: null }

        if (existingOrder?.id) {
          createdOrderIds.push(existingOrder.id)
          // orders is the primary record for cart purchases; marketplace_orders is
          // the canonical table the rest of the app (and mobile completion polling)
          // reads from. Best-effort — a retry delivery must not fail on this.
          // paid_amount is omitted: the RPC validates it against the item's unit
          // price, but `amount` here is the line total (unit price * qty), which
          // would false-positive on any cart line with qty > 1.
          const { error: canonicalOrderError } = await supabaseAdmin.rpc('complete_marketplace_order', {
            item_id: productId,
            buyer_id: athleteId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
          })
          if (canonicalOrderError) console.error('[stripe/webhook] complete_marketplace_order (existing) failed:', canonicalOrderError)
          continue
        }

        const { data: orderRow, error: orderInsertError } = await supabaseAdmin
          .from('orders')
          .insert({
            athlete_id: athleteId,
            sub_profile_id: subProfileId,
            product_id: productId,
            coach_id: coachId || null,
            org_id: orgId || null,
            seller_type: sellerType,
            seller_id: sellerId || null,
            status: 'Paid',
            amount,
            platform_fee: platformFeeDecimal,
            platform_fee_rate: platformFeeRate,
            net_amount: netAmountDecimal,
            payment_intent_id: paymentIntentId || null,
            fulfillment_status: 'delivered',
            delivered_at: nowIso,
          })
          .select('id')
          .maybeSingle()

        if (orderInsertError) throw orderInsertError

        if (orderRow?.id) {
          createdOrderIds.push(orderRow.id)
          await supabaseAdmin.from('payment_receipts').insert({
            payer_id: athleteId,
            payee_id: coachId || null,
            org_id: orgId || null,
            seller_type: sellerType,
            seller_id: sellerId || null,
            order_id: orderRow.id,
            amount,
            currency: 'usd',
            status: 'paid',
            stripe_payment_intent_id: paymentIntentId || null,
            metadata: {
              source: 'cart_checkout',
              product_id: productId,
              sub_profile_id: subProfileId,
              athlete_label: athleteLabel,
              platform_fee: platformFeeDecimal,
              platform_fee_rate: platformFeeRate,
              net_amount: netAmountDecimal,
            },
          })
          await sendLegacyMarketplaceOrderEmails({
            orderId: orderRow.id,
            productId,
            buyerId: athleteId,
            coachId: coachId || null,
            orgId: orgId || null,
            amount,
            currency: 'usd',
          }).catch((err: unknown) => console.error('[stripe/webhook] marketplace order email failed:', err))

          const { error: canonicalOrderError } = await supabaseAdmin.rpc('complete_marketplace_order', {
            item_id: productId,
            buyer_id: athleteId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
          })
          if (canonicalOrderError) console.error('[stripe/webhook] complete_marketplace_order failed:', canonicalOrderError)

          getPostHogClient().capture({
            distinctId: athleteId,
            event: 'marketplace_order_paid',
            properties: {
              order_id: orderRow.id,
              product_id: productId,
              coach_id: coachId || null,
              org_id: orgId || null,
              seller_type: sellerType,
              gross_revenue: amount,
              quantity: qty,
              currency: 'usd',
            },
          })
        }

        const sellerTypeForTransfer = coachId ? 'coach' : orgId ? 'org' : null
        const sellerIdForTransfer = coachId || orgId || null
        if (!hasTransferData && sellerTypeForTransfer && sellerIdForTransfer && stripeAccountId && netAmount > 0) {
          const transferKey = `${sellerTypeForTransfer}:${sellerIdForTransfer}`
          const existing = sellerTransfers.get(transferKey)
          sellerTransfers.set(transferKey, {
            sellerType: sellerTypeForTransfer,
            sellerId: sellerIdForTransfer,
            stripeAccountId,
            netAmount: (existing?.netAmount || 0) + netAmount,
            orderIds: [...(existing?.orderIds || []), ...(orderRow?.id ? [orderRow.id] : [])],
          })
        }
      }

      if (!hasTransferData && chargeId && sellerTransfers.size > 0) {
        for (const transfer of Array.from(sellerTransfers.values())) {
          const stripeTransfer = await stripe.transfers.create({
            amount: transfer.netAmount,
            currency: 'usd',
            destination: transfer.stripeAccountId,
            source_transaction: chargeId,
          }).catch(async (err) => {
            console.error('[webhook] stripe transfer failed — seller may not be paid', {
              sellerType: transfer.sellerType,
              sellerId: transfer.sellerId,
              stripeAccountId: transfer.stripeAccountId,
              amount: transfer.netAmount,
              chargeId,
              error: err?.message,
            })
            if (transfer.orderIds.length > 0) {
              await supabaseAdmin
                .from('orders')
                .update({ status: 'payment_transfer_failed' })
                .in('id', transfer.orderIds)
            }
            void queueOperationTaskSafely({
              type: 'billing_reconciliation',
              title: `Stripe transfer failed for ${transfer.sellerType} cart payout`,
              priority: 'high',
              owner: 'Finance Ops',
              entity_type: transfer.sellerType,
              entity_id: transfer.sellerId,
              max_attempts: 6,
              idempotency_key: `stripe_transfer_failed:${chargeId}:${transfer.sellerType}:${transfer.sellerId}`,
              last_error: err?.message || 'Stripe transfer failed',
              metadata: {
                seller_type: transfer.sellerType,
                seller_id: transfer.sellerId,
                stripe_account_id: transfer.stripeAccountId,
                amount_cents: transfer.netAmount,
                charge_id: chargeId,
                checkout_session_id: session.id,
                order_ids: transfer.orderIds,
              },
            })
          })
          if (stripeTransfer?.id && transfer.orderIds.length > 0) {
            const { data: receiptRows } = await supabaseAdmin
              .from('payment_receipts')
              .select('id, metadata')
              .in('order_id', transfer.orderIds)

            for (const receipt of receiptRows || []) {
              const receiptMeta = (receipt.metadata || {}) as Record<string, unknown>
              await supabaseAdmin
                .from('payment_receipts')
                .update({
                  metadata: {
                    ...receiptMeta,
                    stripe_transfer_id: stripeTransfer.id,
                    stripe_transfer_destination: transfer.stripeAccountId,
                    stripe_transfer_amount_cents: transfer.netAmount,
                  },
                })
                .eq('id', receipt.id)
            }
          }
        }
      }

      await supabaseAdmin.from('profiles').update({ cart: [] }).eq('id', athleteId)
    }
  }

  await fulfillMobileCheckoutSession(session)
}

const handleCheckoutSessionAsyncPaymentSucceeded = async (event: Stripe.Event) => {
  await fulfillMobileCheckoutSession(event.data.object as Stripe.Checkout.Session)
}

const handleCheckoutSessionExpired = async (event: Stripe.Event) => {
  const session = event.data.object as any
  await expireMobileCheckoutSession(session)
  if (session.mode === 'subscription' && session.metadata?.source === 'coach_membership') {
    await syncCoachMembershipSubscription({
      checkoutSession: session,
      statusOverride: 'expired',
      checkoutExpired: true,
      eventSource: 'checkout.session.expired',
    })
  }
}

const handleSubscriptionEvent = async (event: Stripe.Event) => {
  const subscription = event.data.object as any
  const metadata = (subscription.metadata || {}) as Record<string, string>
  const handledCoachMembership = await syncCoachMembershipSubscription({
    subscription,
    statusOverride:
      event.type === 'customer.subscription.deleted'
        ? 'canceled'
        : event.type === 'customer.subscription.trial_will_end'
          ? subscription.status || 'trialing'
          : null,
    eventSource: event.type,
  })
  if (handledCoachMembership) return

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || null

  const priceId = subscription.items?.data?.[0]?.price?.id as string | undefined
  const baseItem = subscription.items?.data?.[0]
  const { billingRole, tier: resolvedTier } = resolveStripeSubscriptionContext({ metadata, priceId })
  const newStatus = subscription.status || (event.type === 'customer.subscription.deleted' ? 'canceled' : null)

  await syncSubscriptionState({
    userId: metadata.user_id || null,
    billingRole,
    tier: resolvedTier,
    customerId,
    subscriptionStatus: newStatus,
    orgId: metadata.org_id || null,
    subscriptionId: subscription.id || null,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    trialEnd: subscription.trial_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    billingInterval: metadata.billing_interval || baseItem?.price?.recurring?.interval || null,
    stripePriceId: baseItem?.price?.id || priceId || null,
    stripeSubscriptionItemId: baseItem?.id || null,
    stripeCoachSeatItemId: null,
    renewalAmountCents: subscription.items?.data?.reduce(
      (sum: number, item: any) => sum + Number(item.price?.unit_amount || 0) * Number(item.quantity || 1),
      0,
    ) || null,
    purchaseChannel: 'stripe',
  })

  getPostHogClient().capture({
    event: 'Subscription Status Changed',
    distinctId: metadata.user_id || (metadata.org_id ? `org:${metadata.org_id}` : customerId || subscription.id),
    properties: {
      billing_role: billingRole,
      tier: resolvedTier,
      user_id: metadata.user_id || null,
      org_id: metadata.org_id || null,
      customer_id: customerId || null,
      subscription_id: subscription.id || null,
      subscription_status: newStatus,
    },
  })

  if (newStatus === 'canceled' || event.type === 'customer.subscription.deleted') {
    getPostHogClient().capture({
      distinctId: metadata.user_id || (metadata.org_id ? `org:${metadata.org_id}` : customerId || subscription.id),
      event: 'subscription_churned',
      properties: {
        billing_role: billingRole,
        tier: resolvedTier,
        user_id: metadata.user_id || null,
        org_id: metadata.org_id || null,
        customer_id: customerId || null,
        subscription_id: subscription.id || null,
        churn_type: event.type === 'customer.subscription.deleted' ? 'deleted' : 'status_changed',
      },
    })
  }

  if (customerId && newStatus && ['active', 'canceled', 'trialing', 'past_due'].includes(newStatus)) {
    const profile = await loadUserForCustomer(customerId)
    if (profile?.id) {
      const { data: userProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', profile.id)
        .maybeSingle()
      if (userProfile?.email) {
        await sendSubscriptionUpdatedEmail({
          toEmail: userProfile.email,
          toName: userProfile.full_name,
          planName: resolvedTier || undefined,
          newStatus,
          dashboardUrl: roleToPath(profile.role),
        }).catch((err: unknown) => console.error('[stripe/webhook] subscription updated email failed:', err))
      }
    }
  }
}

const handleInvoiceEvent = async (event: Stripe.Event) => {
  const invoice = event.data.object as any
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id || null
  if (!customerId) return

  let billingRole: string | null = null
  let tier: string | null = null
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id || invoice.parent?.subscription_details?.subscription || null
  const stripeSubscription = await retrieveSubscriptionForInvoice(invoice)
  if (stripeSubscription) {
    const handledCoachMembership = await syncCoachMembershipSubscription({
      subscription: stripeSubscription,
      statusOverride: event.type === 'invoice.payment_failed' ? 'past_due' : stripeSubscription.status || 'active',
      eventSource: event.type,
    })
    if (handledCoachMembership) {
      if (event.type === 'invoice.payment_failed') {
        getPostHogClient().capture({
          event: 'coach_membership_invoice_payment_failed',
          distinctId: customerId,
          properties: {
            subscription_id: subscriptionId,
            invoice_id: invoice.id || null,
            amount_due: (invoice.amount_due ?? 0) / 100,
            currency: invoice.currency || 'usd',
          },
        })
      }
      return
    }
    const metadata = (stripeSubscription.metadata || {}) as Record<string, string>
    const context = resolveStripeSubscriptionContext({ metadata, priceId: stripeSubscription.items?.data?.[0]?.price?.id })
    billingRole = context.billingRole
    tier = context.tier
  }

  await syncSubscriptionState({
    customerId,
    billingRole: billingRole as BillingRole | null,
    tier,
    subscriptionStatus: event.type === 'invoice.payment_succeeded' ? 'active' : 'past_due',
  })

  getPostHogClient().capture({
    event: event.type === 'invoice.payment_succeeded'
      ? 'Subscription Revenue Recorded'
      : 'Subscription Payment Failed',
    distinctId: customerId,
    properties: {
      billing_role: billingRole,
      tier,
      customer_id: customerId,
      subscription_id: subscriptionId,
      gross_revenue: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
      platform_revenue: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
      platform_net_profit_estimate: (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
      currency: invoice.currency || 'usd',
      invoice_id: invoice.id || null,
      subscription_status: event.type === 'invoice.payment_succeeded' ? 'active' : 'past_due',
    },
  })

  if (event.type === 'invoice.payment_failed') {
    const profile = await loadUserForCustomer(customerId)
    if (profile?.id) {
      const { data: userProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email, role')
        .eq('id', profile.id)
        .maybeSingle()
      if (userProfile?.email) {
        await sendSubscriptionPaymentFailedEmail({
          toEmail: userProfile.email,
          toName: userProfile.full_name,
          updateBillingUrl: '/select-plan',
          dashboardUrl: roleToPath(userProfile.role),
        }).catch((err: unknown) => console.error('[stripe/webhook] payment failed email failed:', err))
      }
    }
  }
}

const handleChargeDisputeEvent = async (event: Stripe.Event) => {
  const dispute = event.data.object as any
  const paymentIntentId = typeof dispute.payment_intent === 'string'
    ? dispute.payment_intent
    : dispute.payment_intent?.id
  const chargeId = typeof dispute.charge === 'string'
    ? dispute.charge
    : dispute.charge?.id

  const { data: order } = paymentIntentId
    ? await supabaseAdmin
        .from('orders')
        .select('id, org_id, coach_id, athlete_id')
        .eq('payment_intent_id', paymentIntentId)
        .maybeSingle()
    : { data: null }

  const { data: assignment } = paymentIntentId
    ? await supabaseAdmin
        .from('org_fee_assignments')
        .select('id, org_id')
        .eq('payment_intent_id', paymentIntentId)
        .maybeSingle()
    : { data: null }

  await upsertDispute({
    disputeId: dispute.id,
    orderId: order?.id || null,
    feeAssignmentId: assignment?.id || null,
    paymentIntentId,
    chargeId,
    amount: dispute.amount ? dispute.amount / 100 : null,
    currency: dispute.currency || null,
    reason: dispute.reason || null,
    status: dispute.status || null,
    evidenceDueBy: dispute.evidence_details?.due_by || null,
  })

  if (order?.id) {
    const nextStatus = getOrderDisputeRefundStatus(event.type, dispute.status)
    await supabaseAdmin.from('orders').update({ refund_status: nextStatus }).eq('id', order.id)
    await supabaseAdmin.from('payment_receipts').update({ status: nextStatus }).eq('order_id', order.id)
  }
}

const handleChargeSucceeded = async (event: Stripe.Event) => {
  const charge = event.data.object as any
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id
  if (!paymentIntentId) return

  await supabaseAdmin
    .from('payment_receipts')
    .update({ stripe_charge_id: charge.id, receipt_url: charge.receipt_url || null })
    .eq('stripe_payment_intent_id', paymentIntentId)

  const { data: receiptRow } = await supabaseAdmin
    .from('payment_receipts')
    .select('id, payer_id, amount, currency')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (receiptRow?.payer_id) {
    const { data: payerProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', receiptRow.payer_id)
      .maybeSingle()
    if (payerProfile?.email) {
      await sendPaymentReceiptEmail({
        toEmail: payerProfile.email,
        toName: payerProfile.full_name,
        amount: receiptRow.amount,
        currency: receiptRow.currency,
        receiptId: receiptRow.id,
        description: 'Payment receipt',
        dashboardUrl: roleToPath(payerProfile.role),
      }).catch((err: unknown) => console.error('[stripe/webhook] receipt email failed:', err))
    }
  }
}

const handlePaymentIntentSucceeded = async (event: Stripe.Event) => {
  const eventIntent = event.data.object as Stripe.PaymentIntent
  const intent = await stripe.paymentIntents.retrieve(eventIntent.id, { expand: ['latest_charge'] })
  await fulfillLegacyFeePaymentIntent(intent)
  await fulfillLegacyMarketplacePaymentIntent(intent)
  await syncPaymentIntentToLedger(intent, 'succeeded')
  const chargeId = typeof intent.latest_charge === 'string'
    ? intent.latest_charge
    : intent.latest_charge?.id
  if (chargeId) {
    await supabaseAdmin
      .from('payment_receipts')
      .update({ stripe_charge_id: chargeId })
      .eq('stripe_payment_intent_id', intent.id)
  }
}

const handlePaymentIntentFailed = async (event: Stripe.Event) => {
  const eventIntent = event.data.object as Stripe.PaymentIntent
  const intent = await stripe.paymentIntents.retrieve(eventIntent.id, { expand: ['latest_charge'] })
  await syncPaymentIntentToLedger(intent, 'failed')

  const installmentId = intent.metadata?.installmentId || intent.metadata?.installment_id
  if (installmentId) {
    const { data: installment } = await supabaseAdmin
      .from('org_dues_installments')
      .select('id, retry_count')
      .eq('id', installmentId)
      .maybeSingle()
    if (installment) {
      const retryCount = Math.min(Number(installment.retry_count || 0) + 1, 3)
      const retryDays = [3, 7, 14]
      const scheduledFor = new Date(Date.now() + retryDays[retryCount - 1] * 86_400_000).toISOString()
      await supabaseAdmin.from('org_dues_installments').update({
        status: 'failed', retry_count: retryCount, last_retry_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', installment.id)
      await supabaseAdmin.from('org_dues_retry_attempts').upsert({
        installment_id: installment.id,
        attempt_number: retryCount,
        scheduled_for: scheduledFor,
        outcome: 'scheduled',
        stripe_payment_intent_id: intent.id,
        failure_code: intent.last_payment_error?.code || null,
        failure_message: intent.last_payment_error?.message || null,
      }, { onConflict: 'installment_id,attempt_number' })
    }
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return jsonError('Missing STRIPE_WEBHOOK_SECRET', 500)
  }

  const sig = request.headers.get('stripe-signature')
  if (!sig) return jsonError('Missing stripe-signature header', 400)

  const body = await request.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err: any) {
    return jsonError(`Webhook error: ${err?.message || 'Invalid signature'}`, 400)
  }

  // Idempotency guard: ignore duplicate Stripe event deliveries.
  const { error: logError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
    })

  if (logError) {
    if (logError.code === '23505') {
      const { data: existingEvent } = await supabaseAdmin
        .from('stripe_webhook_events')
        .select('status')
        .eq('event_id', event.id)
        .maybeSingle()
      if (existingEvent?.status === 'failed') {
        await supabaseAdmin
          .from('stripe_webhook_events')
          .update({ status: 'processing', processed_at: null, last_error: null })
          .eq('event_id', event.id)
      } else {
        return NextResponse.json({ received: true })
      }
    }
    if (logError.code === '42P01') {
      return jsonError('stripe_webhook_events table not found. Run the SQL migration first.', 500)
    }
    if (logError.code !== '23505') {
      return jsonError(logError.message || 'Unable to log webhook event', 500)
    }
  }

  try {
    if (event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'refund.failed') {
      await handleRefundEvent(event)
    }
    if (event.type === 'charge.refunded') {
      await handleChargeRefunded(event)
    }
    if (event.type === 'account.updated') {
      await handleAccountUpdated(event)
    }
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutSessionCompleted(event)
    }
    if (event.type === 'checkout.session.async_payment_succeeded') {
      await handleCheckoutSessionAsyncPaymentSucceeded(event)
    }
    if (event.type === 'checkout.session.expired') {
      await handleCheckoutSessionExpired(event)
    }
    if (
      event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted'
      || event.type === 'customer.subscription.trial_will_end'
    ) {
      await handleSubscriptionEvent(event)
    }
    if (
      event.type === 'invoice.payment_succeeded'
      || event.type === 'invoice.paid'
      || event.type === 'invoice.payment_failed'
    ) {
      await handleInvoiceEvent(event)
    }
    if (event.type.startsWith('charge.dispute')) {
      await handleChargeDisputeEvent(event)
    }
    if (event.type === 'charge.succeeded') {
      await handleChargeSucceeded(event)
    }
    if (event.type === 'payment_intent.succeeded') {
      await handlePaymentIntentSucceeded(event)
    }
    if (event.type === 'payment_intent.payment_failed') {
      await handlePaymentIntentFailed(event)
    }
    const eventObject = event.data.object as any
    const metadataWorkspaceId = String(eventObject?.metadata?.workspace_id || '').trim() || null
    const objectId = String(eventObject?.id || '')
    const paymentIntentId = typeof eventObject?.payment_intent === 'string'
      ? eventObject.payment_intent
      : eventObject?.payment_intent?.id || (event.type.startsWith('payment_intent.') ? objectId : null)
    const subscriptionId = typeof eventObject?.subscription === 'string'
      ? eventObject.subscription
      : eventObject?.subscription?.id || (event.type.startsWith('customer.subscription.') ? objectId : null)
    const customerId = typeof eventObject?.customer === 'string' ? eventObject.customer : eventObject?.customer?.id
    const [{ data: accountingWorkspace }, { data: subscriptionWorkspace }, { data: connectWorkspace }] = await Promise.all([
      paymentIntentId ? supabaseAdmin.from('stripe_connect_payment_accounting').select('workspace_id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle() : Promise.resolve({ data: null }),
      subscriptionId || customerId ? supabaseAdmin.from('platform_subscriptions').select('workspace_id')
        .or([subscriptionId ? `stripe_subscription_id.eq.${subscriptionId}` : '', customerId ? `stripe_customer_id.eq.${customerId}` : ''].filter(Boolean).join(',')).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      event.type === 'account.updated' ? supabaseAdmin.from('stripe_connect_accounts').select('workspace_id').eq('stripe_account_id', objectId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const eventWorkspaceId = metadataWorkspaceId || accountingWorkspace?.workspace_id || subscriptionWorkspace?.workspace_id || connectWorkspace?.workspace_id || null
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
        workspace_id: eventWorkspaceId,
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('event_id', event.id)
  } catch (error: any) {
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
        status: 'failed',
        processed_at: new Date().toISOString(),
        last_error: error?.message || 'Unhandled webhook processing error',
      })
      .eq('event_id', event.id)

    await queueOperationTaskSafely({
      type: 'webhook_replay',
      title: `Stripe webhook processing failed (${event.type})`,
      priority: 'high',
      owner: 'Platform Ops',
      entity_type: 'stripe_event',
      entity_id: event.id,
      max_attempts: 8,
      idempotency_key: `stripe_webhook:${event.id}`,
      last_error: error?.message || 'Unhandled webhook processing error',
      metadata: {
        event_type: event.type,
      },
    })
    await getPostHogClient().flush?.()
    return jsonError(error?.message || 'Webhook processing failed', 500)
  }

  await getPostHogClient().flush?.()
  return NextResponse.json({ received: true })
}
