import type Stripe from 'stripe'
import { insertNotifications } from '@/lib/inAppNotifications'
import stripe from '@/lib/stripeServer'
import { getConnectRefundOptions } from '@/lib/stripeConnectRefund'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const REFUND_REQUEST_STATUSES = [
  'requested',
  'under_review',
  'approved',
  'rejected',
  'processing',
  'refunded',
  'failed',
  'canceled',
] as const

export type RefundRequestStatus = typeof REFUND_REQUEST_STATUSES[number]
type PaymentType = 'org_fee' | 'coach_fee' | 'marketplace_order'

type RefundRequestRow = {
  id: string
  requester_id: string
  athlete_id?: string | null
  payment_type: PaymentType
  payment_record_id: string
  amount: number | string
  requested_amount_cents?: number | null
  refunded_amount_cents?: number | null
  reason: string
  status: RefundRequestStatus
  stripe_refund_id?: string | null
  resolution_note?: string | null
  requested_at: string
  resolved_at?: string | null
  updated_at: string
}

type RefundActor = { id: string; email?: string | null }

type PaymentRecord = {
  paymentIntentId: string
  amountCents: number
  status: string
}

export const refundRequestStatusFromStripe = (
  eventType: 'refund.created' | 'refund.updated' | 'refund.failed',
  stripeStatus?: string | null,
): RefundRequestStatus =>
  eventType === 'refund.failed' || stripeStatus === 'failed'
    ? 'failed'
    : stripeStatus === 'succeeded'
      ? 'refunded'
      : stripeStatus === 'canceled'
        ? 'canceled'
        : 'processing'

export const isChargeFullyRefunded = (amount: number, amountRefunded: number) =>
  amount > 0 && amountRefunded >= amount

const dollarsToCents = (value: number | string | null | undefined) =>
  Math.round(Number(value || 0) * 100)

const loadRequest = async (requestId: string) => {
  const { data, error } = await supabaseAdmin
    .from('payment_refund_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Refund request not found')
  return data as RefundRequestRow
}

const loadPaymentRecord = async (request: RefundRequestRow): Promise<PaymentRecord> => {
  if (request.payment_type === 'org_fee') {
    const { data, error } = await supabaseAdmin
      .from('org_fee_assignments')
      .select('id, amount, status, stripe_payment_intent_id')
      .eq('id', request.payment_record_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data?.stripe_payment_intent_id) throw new Error('Organization fee has no Stripe PaymentIntent')
    return {
      paymentIntentId: data.stripe_payment_intent_id,
      amountCents: dollarsToCents(data.amount),
      status: String(data.status || ''),
    }
  }

  if (request.payment_type === 'coach_fee') {
    const { data, error } = await supabaseAdmin
      .from('coach_fee_assignments')
      .select('id, amount, status, stripe_payment_intent_id')
      .eq('id', request.payment_record_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data?.stripe_payment_intent_id) throw new Error('Coach fee has no Stripe PaymentIntent')
    return {
      paymentIntentId: data.stripe_payment_intent_id,
      amountCents: dollarsToCents(data.amount),
      status: String(data.status || ''),
    }
  }

  const { data, error } = await supabaseAdmin
    .from('marketplace_orders')
    .select('id, total_amount, amount, status, payment_status, stripe_payment_intent_id')
    .eq('id', request.payment_record_id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.stripe_payment_intent_id) throw new Error('Marketplace order has no Stripe PaymentIntent')
  return {
    paymentIntentId: data.stripe_payment_intent_id,
    amountCents: dollarsToCents(data.total_amount ?? data.amount),
    status: String(data.payment_status || data.status || ''),
  }
}

const latestChargeFromIntent = (intent: Stripe.PaymentIntent) => {
  const charge = intent.latest_charge
  if (!charge || typeof charge === 'string') return null
  return charge as Stripe.Charge
}

export const validateRefundRequestAgainstStripe = async (requestId: string) => {
  const request = await loadRequest(requestId)
  const payment = await loadPaymentRecord(request)
  if (!['paid', 'disputed'].includes(payment.status.toLowerCase())) {
    throw new Error('The associated payment is not refundable')
  }

  const intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId, {
    expand: ['latest_charge'],
  })
  if (intent.status !== 'succeeded') throw new Error('Stripe PaymentIntent is not succeeded')

  const charge = latestChargeFromIntent(intent)
  if (!charge || charge.status !== 'succeeded' || charge.paid !== true) {
    throw new Error('Stripe charge is not refundable')
  }
  if (charge.refunded) throw new Error('Stripe charge is already fully refunded')

  const refundableBalanceCents = Math.max(0, charge.amount - charge.amount_refunded)
  const requestedAmountCents = Number(request.requested_amount_cents || dollarsToCents(request.amount))
  const paymentAmountCents = Math.min(payment.amountCents, intent.amount_received || intent.amount)
  if (requestedAmountCents <= 0 || requestedAmountCents > paymentAmountCents) {
    throw new Error('Requested amount exceeds the verified payment amount')
  }
  if (requestedAmountCents > refundableBalanceCents) {
    throw new Error('Requested amount exceeds Stripe refundable balance')
  }
  if (intent.currency !== charge.currency) throw new Error('Stripe currency mismatch')

  return {
    request,
    payment,
    intent,
    charge,
    amountCents: requestedAmountCents,
    refundableBalanceCents,
    currency: intent.currency,
  }
}

const updateRequestStatus = async (
  requestId: string,
  status: RefundRequestStatus,
  values: Record<string, unknown> = {},
) => {
  const now = new Date().toISOString()
  const resolved = ['rejected', 'refunded', 'failed', 'canceled'].includes(status)
  const { data, error } = await supabaseAdmin
    .from('payment_refund_requests')
    .update({
      status,
      updated_at: now,
      ...(resolved ? { resolved_at: now } : {}),
      ...values,
    })
    .eq('id', requestId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as RefundRequestRow
}

const recordRefundState = async (
  requestId: string,
  status: RefundRequestStatus,
  values: {
    stripeRefundId?: string | null
    stripeRefundStatus?: string | null
    refundedAmountCents?: number | null
    resolutionNote?: string | null
    approvedBy?: string | null
    auditMetadata?: Record<string, unknown>
  } = {},
) => {
  const { data, error } = await supabaseAdmin.rpc('record_refund_request_state', {
    p_request_id: requestId,
    p_status: status,
    p_stripe_refund_id: values.stripeRefundId || null,
    p_stripe_refund_status: values.stripeRefundStatus || null,
    p_refunded_amount_cents: values.refundedAmountCents ?? null,
    p_resolution_note: values.resolutionNote || null,
    p_approved_by: values.approvedBy || null,
    p_audit_metadata: values.auditMetadata || {},
  })
  if (error) throw new Error(error.message)
  return data as RefundRequestRow
}

const notifyRefundStatus = async (request: RefundRequestRow) => {
  const labels: Record<RefundRequestStatus, string> = {
    requested: 'Refund requested',
    under_review: 'Refund under review',
    approved: 'Refund approved',
    rejected: 'Refund request rejected',
    processing: 'Refund processing',
    refunded: 'Refund completed',
    failed: 'Refund failed',
    canceled: 'Refund request canceled',
  }
  await insertNotifications({
    user_id: request.requester_id,
    type: 'refund_status_changed',
    title: labels[request.status],
    body: `Your refund request is now ${request.status.replaceAll('_', ' ')}.`,
    action_url: '/athlete/payments',
    data: {
      category: 'Payments',
      refund_request_id: request.id,
      payment_type: request.payment_type,
      payment_record_id: request.payment_record_id,
      refund_status: request.status,
    },
  })
}

export const setRefundRequestReviewStatus = async (
  requestId: string,
  status: 'under_review' | 'rejected' | 'canceled',
  resolutionNote?: string | null,
) => {
  const current = await loadRequest(requestId)
  if (['processing', 'refunded'].includes(current.status)) {
    throw new Error('A processing or completed refund cannot be changed manually')
  }
  const updated = await updateRequestStatus(requestId, status, {
    resolution_note: resolutionNote?.trim() || null,
  })
  if (updated.status !== current.status) await notifyRefundStatus(updated)
  return updated
}

export const approveAndProcessRefundRequest = async (
  requestId: string,
  resolutionNote?: string | null,
  actor?: RefundActor | null,
) => {
  const validation = await validateRefundRequestAgainstStripe(requestId)
  const current = validation.request
  if (current.status === 'refunded') return current
  if (current.status === 'rejected' || current.status === 'canceled') {
    throw new Error(`Cannot approve a ${current.status} refund request`)
  }

  if (current.status !== 'approved' && current.status !== 'processing') {
    const approved = await recordRefundState(requestId, 'approved', {
      resolutionNote: resolutionNote?.trim() || current.resolution_note || null,
      approvedBy: actor?.id || null,
      auditMetadata: {
        approval_actor_id: actor?.id || null,
        approval_actor_email: actor?.email || null,
        approved_at: new Date().toISOString(),
      },
    })
    await notifyRefundStatus(approved)
  }

  const processing = await recordRefundState(requestId, 'processing', {
    resolutionNote: resolutionNote?.trim() || current.resolution_note || null,
    approvedBy: actor?.id || null,
    auditMetadata: { stripe_create_requested_at: new Date().toISOString() },
  })
  if (current.status !== 'processing') await notifyRefundStatus(processing)

  try {
    const connectOptions = getConnectRefundOptions(validation.charge)
    const refund = await stripe.refunds.create(
      {
        payment_intent: validation.payment.paymentIntentId,
        amount: validation.amountCents,
        metadata: {
          refund_request_id: requestId,
          payment_type: current.payment_type,
          payment_record_id: current.payment_record_id,
          requester_id: current.requester_id,
        },
        ...(connectOptions.refundApplicationFee ? { refund_application_fee: true } : {}),
        ...(connectOptions.reverseTransfer ? { reverse_transfer: true } : {}),
      },
      { idempotencyKey: `refund-request-${requestId}` },
    )

    // A fast webhook may have finalized the request before Stripe's create
    // response returns. Never regress a webhook-confirmed terminal status.
    const latest = await loadRequest(requestId)
    if (['refunded', 'failed', 'canceled'].includes(latest.status)) return latest

    const updated = await recordRefundState(requestId, refund.status === 'failed' ? 'failed' : 'processing', {
      stripeRefundId: refund.id,
      stripeRefundStatus: refund.status || 'pending',
      refundedAmountCents: refund.status === 'succeeded' ? validation.amountCents : 0,
      resolutionNote: refund.status === 'failed' ? refund.failure_reason || 'Stripe refund failed' : null,
      approvedBy: actor?.id || null,
      auditMetadata: {
        stripe_refund_created_at: new Date().toISOString(),
        requested_amount_cents: validation.amountCents,
      },
    })
    if (updated.status === 'failed') await notifyRefundStatus(updated)
    return updated
  } catch (error) {
    const failed = await recordRefundState(requestId, 'failed', {
      resolutionNote: error instanceof Error ? error.message : 'Stripe refund failed',
      approvedBy: actor?.id || null,
      auditMetadata: { stripe_refund_failed_at: new Date().toISOString() },
    })
    await notifyRefundStatus(failed)
    throw error
  }
}

const markAssociatedPaymentRefunded = async (request: RefundRequestRow) => {
  if (request.payment_type === 'org_fee') {
    const { error } = await supabaseAdmin
      .from('org_fee_assignments')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', request.payment_record_id)
    if (error) throw new Error(error.message)
    return
  }
  if (request.payment_type === 'coach_fee') {
    const { error } = await supabaseAdmin
      .from('coach_fee_assignments')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', request.payment_record_id)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabaseAdmin
    .from('marketplace_orders')
    .update({ status: 'refunded', payment_status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', request.payment_record_id)
  if (error) throw new Error(error.message)
}

export const handleStripeRefundEvent = async (
  eventType: 'refund.created' | 'refund.updated' | 'refund.failed',
  refund: Stripe.Refund,
) => {
  const requestId = refund.metadata?.refund_request_id || null
  const query = supabaseAdmin.from('payment_refund_requests').select('*')
  const { data, error } = requestId
    ? await query.eq('id', requestId).maybeSingle()
    : await query.eq('stripe_refund_id', refund.id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const current = data as RefundRequestRow
  const nextStatus = refundRequestStatusFromStripe(eventType, refund.status)

  let fullyRefunded = false
  if (nextStatus === 'refunded') {
    const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId)
      fullyRefunded = isChargeFullyRefunded(charge.amount, charge.amount_refunded)
    }
    if (fullyRefunded) await markAssociatedPaymentRefunded(current)
  }
  const updated = await recordRefundState(current.id, nextStatus, {
    stripeRefundId: refund.id,
    stripeRefundStatus: refund.status || nextStatus,
    refundedAmountCents: nextStatus === 'refunded' ? refund.amount : current.refunded_amount_cents || 0,
    resolutionNote: nextStatus === 'failed'
      ? refund.failure_reason || current.resolution_note || 'Stripe refund failed'
      : null,
    auditMetadata: {
      stripe_event_type: eventType,
      stripe_event_recorded_at: new Date().toISOString(),
      underlying_payment_fully_refunded: fullyRefunded,
    },
  })
  if (updated.status !== current.status || current.stripe_refund_id !== refund.id) {
    await notifyRefundStatus(updated)
  }
  return updated
}
