import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { randomUUID } from 'node:crypto'

const STRIPE_HOSTS = new Set(['checkout.stripe.com','billing.stripe.com','connect.stripe.com','dashboard.stripe.com'])

export function assertStripeHostedUrl(value: string | null | undefined) {
  if (!value) throw new Error('Stripe did not return a hosted URL')
  const url = new URL(value)
  if (url.protocol !== 'https:' || !STRIPE_HOSTS.has(url.hostname)) throw new Error('Stripe returned an untrusted URL')
  return url.toString()
}

export type PaymentErrorCode = 'unauthorized'|'forbidden'|'not_found'|'invalid_request'|'conflict'|'rate_limited'|'not_ready'|'internal_error'
export const paymentErrorBody = (code: PaymentErrorCode, message: string, retryable = false, referenceId = randomUUID()) => ({
  error: { code, message, retryable, reference_id: referenceId },
})

export async function enforcePaymentRateLimit(userId: string, action: string, limit = 10, windowSeconds = 60) {
  const { data, error } = await supabaseAdmin.rpc('assert_payment_action_rate_limit', {
    p_actor_user_id: userId, p_action: action, p_resource_key: 'global', p_max_attempts: limit, p_window_seconds: windowSeconds,
  })
  if (error) throw new Error('Unable to validate payment request rate')
  return data === null || data === undefined
}

export async function auditPaymentAction(input: {
  actorUserId?: string | null; workspaceId?: string | null; organizationId?: string | null; action: string;
  targetType: string; targetId?: string | null; stripeObjectId?: string | null;
  result: 'attempted'|'succeeded'|'failed'|'blocked'; correlationId?: string; metadata?: Record<string, unknown>;
}) {
  const correlationId = input.correlationId || randomUUID()
  const uuid = (value?: string | null) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null
  const { error } = await supabaseAdmin.from('payment_security_audit').insert({
    actor_user_id: input.actorUserId || null, actor_role: 'server', table_name: input.targetType,
    record_id: uuid(input.targetId), changed_fields: Object.keys(input.metadata || {}), request_id: correlationId,
    workspace_id: input.workspaceId || null,
    organization_id: input.organizationId || null, action: input.action, target_type: input.targetType,
    target_id: input.targetId || null, stripe_object_id: input.stripeObjectId || null,
    result: input.result, correlation_id: correlationId, metadata: input.metadata || {},
  })
  if (error) safePaymentError('[payment-audit] insert failed', error, { correlation_id: correlationId })
  return correlationId
}

const stripeObjectId = (value: unknown) => typeof value === 'string' ? value
  : value && typeof value === 'object' && 'id' in value ? String((value as { id: unknown }).id) : null

export async function validatePaymentIntentAuthority(intent: {
  id: string; amount: number; currency: string; transfer_data?: { destination?: unknown } | null;
  metadata?: Record<string, string> | null;
}) {
  const { data: transaction } = await supabaseAdmin.from('payment_transactions')
    .select('id,payer_id,org_id,source_record_type,source_record_id,amount_cents,currency')
    .eq('stripe_payment_intent_id', intent.id).maybeSingle()
  if (!transaction) return
  const metadata = intent.metadata || {}
  if (Number(transaction.amount_cents) !== Number(intent.amount)) throw new Error('Stripe amount does not match authoritative payment record')
  if (String(transaction.currency || 'usd').toLowerCase() !== String(intent.currency).toLowerCase()) throw new Error('Stripe currency does not match authoritative payment record')
  if (metadata.payerId && transaction.payer_id && metadata.payerId !== transaction.payer_id) throw new Error('Stripe payer does not match authoritative payment record')
  if (metadata.sourceRecordId && transaction.source_record_id && metadata.sourceRecordId !== transaction.source_record_id) throw new Error('Stripe target does not match authoritative payment record')
  if (transaction.org_id) {
    const { data: connect } = await supabaseAdmin.from('stripe_connect_accounts').select('stripe_account_id')
      .eq('owner_type', 'org').eq('owner_id', transaction.org_id).maybeSingle()
    const destination = stripeObjectId(intent.transfer_data?.destination)
    if (!connect?.stripe_account_id || destination !== connect.stripe_account_id) throw new Error('Stripe destination does not match authoritative organization account')
  }
}

export const safePaymentError = (scope: string, error: unknown, ids: Record<string, string | null> = {}) => {
  const message = error instanceof Error ? error.message : 'Unknown payment error'
  console.error(scope, { ...ids, error_name: error instanceof Error ? error.name : 'Error', error_message: message.slice(0, 300) })
}
