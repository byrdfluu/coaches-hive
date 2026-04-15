import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPaymentReceiptEmail, sendSubscriptionPaymentFailedEmail, sendSubscriptionUpdatedEmail } from '@/lib/email'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
import { roleToPath } from '@/lib/roleRedirect'
import { queueOperationTaskSafely } from '@/lib/operations'
import { getPostHogClient } from '@/lib/posthog-server'
import {
  getOrderDisputeRefundStatus,
  resolveStripeBillingRole,
  resolveStripeSubscriptionContext,
} from '@/lib/stripeWebhookHelpers'

export const runtime = 'nodejs'

type BillingRole = 'coach' | 'athlete' | 'org'

const normalizeTierForRole = (role: BillingRole, tier?: string | null) => {
  if (role === 'coach') return normalizeCoachTier(tier)
  if (role === 'athlete') return normalizeAthleteTier(tier)
  return normalizeOrgTier(tier)
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

  if (resolvedRole === 'coach' && normalizedTier) {
    await supabaseAdmin
      .from('coach_plans')
      .upsert({ coach_id: resolvedUserId, tier: normalizedTier }, { onConflict: 'coach_id' })
  }

  if (resolvedRole === 'athlete' && normalizedTier) {
    await supabaseAdmin
      .from('athlete_plans')
      .upsert({ athlete_id: resolvedUserId, tier: normalizedTier }, { onConflict: 'athlete_id' })
  }

  if (payload.customerId || payload.subscriptionStatus) {
    const updates: Record<string, string> = {}
    if (payload.customerId) updates.stripe_customer_id = payload.customerId
    if (payload.subscriptionStatus) updates.subscription_status = payload.subscriptionStatus
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from('profiles').update(updates).eq('id', resolvedUserId)
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
}

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const getMissingOrdersColumn = (message?: string | null) => {
  const value = String(message || '')
  const schemaCacheMatch = value.match(/could not find the '([^']+)' column of 'orders' in the schema cache/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]

  const postgresMatch =
    value.match(/column\s+["']?orders["']?\.["']?([a-z_]+)["']?\s+does not exist/i)
    || value.match(/column\s+["']?([a-z_]+)["']?\s+of relation\s+["']?orders["']?\s+does not exist/i)
  return postgresMatch?.[1] || null
}

const insertOrderWithSchemaFallback = async (payload: Record<string, unknown>) => {
  const fallbackPayload: Record<string, unknown> = { ...payload }
  let lastResult: any = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await supabaseAdmin.from('orders').insert(fallbackPayload).select('id').maybeSingle()
    lastResult = result

    const missingColumn = getMissingOrdersColumn(result.error?.message)
    if (!result.error || !missingColumn) {
      return result
    }

    if (missingColumn === 'amount') {
      const amountValue = fallbackPayload.amount
      delete fallbackPayload.amount
      if (fallbackPayload.total === undefined) fallbackPayload.total = amountValue
      if (fallbackPayload.price === undefined) fallbackPayload.price = amountValue
      continue
    }

    delete fallbackPayload[missingColumn]
  }

  return lastResult
}

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
      return NextResponse.json({ received: true })
    }
    if (logError.code === '42P01') {
      return jsonError('stripe_webhook_events table not found. Run the SQL migration first.', 500)
    }
    return jsonError(logError.message || 'Unable to log webhook event', 500)
  }

  try {
    if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any
    if (session.mode === 'subscription') {
      const metadata = (session.metadata || {}) as Record<string, string>
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

      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          subscriptionStatus = subscription.status || subscriptionStatus
        } catch {
          // If retrieval fails, keep metadata/default state and continue.
        }
      }

      await syncSubscriptionState({
        userId,
        billingRole,
        tier,
        customerId,
        subscriptionStatus: subscriptionStatus || 'active',
        orgId,
      })

      const posthogWebhook = getPostHogClient()
      posthogWebhook.capture({
        distinctId: userId || (orgId ? `org:${orgId}` : customerId || 'subscription'),
        event: 'subscription_activated',
        properties: {
          billing_role: billingRole,
          tier,
          org_id: orgId || null,
          user_id: userId || null,
          customer_id: customerId || null,
          subscription_id: subscriptionId,
          subscription_status: subscriptionStatus || 'active',
          gross_revenue: session.amount_total ? session.amount_total / 100 : 0,
          currency: session.currency || 'usd',
        },
      })
    }

    if (session.mode === 'payment' && session.metadata?.checkout_type === 'cart') {
      const metadata = (session.metadata || {}) as Record<string, string>
      const athleteId = metadata.athlete_id || session.client_reference_id || null
      const itemCount = parseInt(metadata.item_count || '0', 10)
      const subProfileId = metadata.sub_profile_id || null
      const athleteLabel = metadata.athlete_label || 'Primary athlete'

      if (athleteId && itemCount > 0) {
        // Get charge ID for Stripe Transfers (multi-coach case)
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

        // Multi-coach tracking: need to dispatch transfers for coaches that don't have transfer_data set
        const hasTransferData = Boolean(session.payment_intent?.transfer_data?.destination)
        const coachTransfers = new Map<string, { stripeAccountId: string; netAmount: number }>()

        for (let i = 0; i < itemCount; i++) {
          const raw = metadata[`item_${i}`]
          if (!raw) continue
          const parts = raw.split('|')
          const [productId, qtyStr, coachId, orgId, amountCentsStr, platformFeeStr, netAmountStr, stripeAccountId] = parts

          const qty = parseInt(qtyStr || '1', 10)
          const amountCents = parseInt(amountCentsStr || '0', 10)
          const platformFee = parseInt(platformFeeStr || '0', 10)
          const netAmount = parseInt(netAmountStr || '0', 10)

          if (!productId || !amountCents) continue

          const amount = amountCents / 100
          const platformFeeDecimal = platformFee / 100
          const netAmountDecimal = netAmount / 100
          const platformFeeRate = amount > 0 ? (platformFeeDecimal / amount) * 100 : 0

          const orderInsertResult = await insertOrderWithSchemaFallback({
            athlete_id: athleteId,
            sub_profile_id: subProfileId,
            product_id: productId,
            coach_id: coachId || null,
            org_id: orgId || null,
            status: 'Paid',
            amount,
            platform_fee: platformFeeDecimal,
            platform_fee_rate: platformFeeRate,
            net_amount: netAmountDecimal,
            payment_intent_id: paymentIntentId || null,
            fulfillment_status: 'delivered',
            delivered_at: nowIso,
          })

          const { data: orderRow, error: orderInsertError } = orderInsertResult
          if (orderInsertError) {
            throw orderInsertError
          }

          if (orderRow?.id) {
            createdOrderIds.push(orderRow.id)
            await supabaseAdmin.from('payment_receipts').insert({
              payer_id: athleteId,
              payee_id: coachId || null,
              org_id: orgId || null,
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

            const sellerType = coachId ? 'coach' : orgId ? 'org' : 'unknown'

            const posthogCart = getPostHogClient()
            posthogCart.capture({
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

          // Queue per-coach transfer for multi-coach carts (no transfer_data on session)
          if (!hasTransferData && coachId && stripeAccountId && netAmount > 0) {
            const existing = coachTransfers.get(coachId)
            coachTransfers.set(coachId, {
              stripeAccountId,
              netAmount: (existing?.netAmount || 0) + netAmount,
            })
          }
        }

        // Dispatch Stripe Transfers to each coach for multi-coach carts
        if (!hasTransferData && chargeId && coachTransfers.size > 0) {
          for (const [coachId, transfer] of Array.from(coachTransfers.entries())) {
            await stripe.transfers.create({
              amount: transfer.netAmount,
              currency: 'usd',
              destination: transfer.stripeAccountId,
              source_transaction: chargeId,
            }).catch((err) => {
              console.error('[webhook] stripe transfer failed — coach may not be paid', {
                coachId,
                stripeAccountId: transfer.stripeAccountId,
                amount: transfer.netAmount,
                chargeId,
                error: err?.message,
              })
            })
          }
        }

        // Clear the athlete's cart
        await supabaseAdmin
          .from('profiles')
          .update({ cart: null })
          .eq('id', athleteId)
      }
    }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any
    const metadata = (subscription.metadata || {}) as Record<string, string>
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id || null

    // When the plan is changed via the Customer Portal, metadata.tier is not updated by Stripe.
    // Use the active price ID to resolve the tier directly from env-var mappings.
    const priceId = subscription.items?.data?.[0]?.price?.id as string | undefined
    const { billingRole, tier: resolvedTier } = resolveStripeSubscriptionContext({
      metadata,
      priceId,
    })

    const newStatus = subscription.status || (event.type === 'customer.subscription.deleted' ? 'canceled' : null)

    await syncSubscriptionState({
      userId: metadata.user_id || null,
      billingRole,
      tier: resolvedTier,
      customerId,
      subscriptionStatus: newStatus,
      orgId: metadata.org_id || null,
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
      const posthogChurn = getPostHogClient()
      posthogChurn.capture({
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

    // Notify user of meaningful subscription status changes.
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

    if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as any
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id || null
    if (customerId) {
      let billingRole: string | null = null
      let tier: string | null = null
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id || null

      if (subscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
        const metadata = (stripeSubscription?.metadata || {}) as Record<string, string>
        const priceId = stripeSubscription?.items?.data?.[0]?.price?.id as string | undefined
        const resolved = resolveStripeSubscriptionContext({ metadata, priceId })
        billingRole = resolved.billingRole
        tier = resolved.tier
      }

      await syncSubscriptionState({
        customerId,
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
    }

    if (event.type.startsWith('charge.dispute')) {
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
      await supabaseAdmin
        .from('orders')
        .update({ refund_status: nextStatus })
        .eq('id', order.id)
      await supabaseAdmin
        .from('payment_receipts')
        .update({ status: nextStatus })
        .eq('order_id', order.id)
    }
    }

    if (event.type === 'charge.succeeded') {
    const charge = event.data.object as any
    const paymentIntentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id
    if (paymentIntentId) {
      await supabaseAdmin
        .from('payment_receipts')
        .update({
          stripe_charge_id: charge.id,
          receipt_url: charge.receipt_url || null,
        })
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
    }

    if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as any
    const chargeId = typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id
    if (chargeId) {
      await supabaseAdmin
        .from('payment_receipts')
        .update({
          stripe_charge_id: chargeId,
        })
        .eq('stripe_payment_intent_id', intent.id)
    }
    }
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
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
    return jsonError(error?.message || 'Webhook processing failed', 500)
  }

  return NextResponse.json({ received: true })
}
