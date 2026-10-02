import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type AttemptStatus = 'processing' | 'checkout_pending' | 'expired' | 'completed' | 'failed' | 'canceled'

export type CheckoutAttemptInput = {
  buyerUserId: string
  idempotencyKey: string
  requestId: string
  checkoutType: string
  checkoutRecordId: string
  purchaseId?: string | null
  athleteProfileId?: string | null
  workspaceId?: string | null
  organizationId?: string | null
  offeringType?: string | null
  offeringId?: string | null
  billingType?: string | null
  amountCents?: number | null
  currency?: string | null
  stripeCheckoutSessionId?: string | null
  expiresAt?: string | null
  status?: AttemptStatus
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
}

/**
 * Records the checkout boundary independently from the offering/registration row.
 * The database unique key makes retries safe across Vercel instances.
 */
export async function recordCheckoutAttempt(input: CheckoutAttemptInput) {
  const { error } = await supabaseAdmin.from('checkout_purchase_attempts').upsert({
    buyer_user_id: input.buyerUserId,
    idempotency_key: input.idempotencyKey,
    request_id: input.requestId,
    checkout_type: input.checkoutType,
    checkout_record_id: input.checkoutRecordId,
    purchase_id: input.purchaseId || input.checkoutRecordId,
    athlete_profile_id: input.athleteProfileId || null,
    workspace_id: input.workspaceId || null,
    organization_id: input.organizationId || null,
    offering_type: input.offeringType || input.checkoutType,
    offering_id: input.offeringId || null,
    billing_type: input.billingType || null,
    amount_cents: Number.isSafeInteger(input.amountCents) ? input.amountCents : null,
    currency: input.currency || 'usd',
    stripe_checkout_session_id: input.stripeCheckoutSessionId || null,
    expires_at: input.expiresAt || null,
    status: input.status || 'checkout_pending',
    last_error_code: input.lastErrorCode || null,
    last_error_message: input.lastErrorMessage || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'buyer_user_id,checkout_type,idempotency_key' })
  if (error) console.error('[checkout-attempt] persistence failed', {
    request_id: input.requestId,
    checkout_type: input.checkoutType,
    error_code: error.code,
  })
}

export function canonicalCheckoutResponse(input: {
  payload: Record<string, unknown>
  requestId: string
  checkoutType: string
  checkoutRecordId: string
  purchaseId?: string | null
  status?: string
}) {
  const payload = input.payload
  const checkoutUrl = typeof payload.checkout_url === 'string'
    ? payload.checkout_url
    : typeof payload.url === 'string' ? payload.url : null
  const purchaseId = String(payload.purchase_id || input.purchaseId || input.checkoutRecordId)
  const checkoutRecordId = String(payload.checkout_record_id || payload.subscription_record_id || payload.fee_id || input.checkoutRecordId)
  const fee = payload.fee_breakdown && typeof payload.fee_breakdown === 'object'
    ? payload.fee_breakdown as Record<string, unknown> : {}
  const amountCents = Number(fee.total_cents ?? fee.gross_cents ?? payload.amount_cents ?? 0)
  const baseAmountCents = Number(fee.base_amount_cents ?? fee.gross_cents ?? payload.amount_cents ?? 0)
  const serviceFeeCents = Number(fee.service_fee_cents ?? fee.platform_fee_cents ?? 0)
  return {
    ...payload,
    purchase_id: purchaseId,
    checkout_record_id: checkoutRecordId,
    checkout_type: input.checkoutType,
    checkout_url: checkoutUrl,
    ...(checkoutUrl && typeof payload.url !== 'string' ? { url: checkoutUrl } : {}),
    expires_at: payload.expires_at || null,
    status: payload.status || input.status || 'checkout_pending',
    request_id: input.requestId,
    fee_breakdown: {
      ...fee,
      amount_cents: Number.isFinite(amountCents) ? amountCents : 0,
      base_amount_cents: Number.isFinite(baseAmountCents) ? baseAmountCents : 0,
      service_fee_cents: Number.isFinite(serviceFeeCents) ? serviceFeeCents : 0,
      currency: String(fee.currency || payload.currency || 'usd').toLowerCase(),
    },
  }
}

export function checkoutJson(payload: ReturnType<typeof canonicalCheckoutResponse>, requestId: string, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId },
  })
}
