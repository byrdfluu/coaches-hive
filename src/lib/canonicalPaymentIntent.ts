import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrgPlatformFee, calculateOrgPlatformFeeForOrg, getFeeSettings } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { stripeIdempotencyKey } from '@/lib/mobilePaymentApi'
import type { TransactionType } from '@/lib/paymentLedger'
import { auditPaymentAction, enforcePaymentRateLimit } from '@/lib/paymentSecurity'
import { ORGANIZATION_PAYMENT_POLICY_VERSION, calculateOrganizationPayment, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'

type Input = {
  userId: string
  idempotencyKey: string
  transactionType: TransactionType
  sourceRecordType: string
  sourceRecordId: string
  amountCents: number
  description: string
  orgId?: string | null
  payerId?: string | null
  playerId?: string | null
  athleteProfileId?: string | null
  teamId?: string | null
  seasonId?: string | null
  destinationAccountId?: string | null
  metadata?: Record<string, string>
}

export type CanonicalPaymentResponse = {
  transaction_id: string
  status: 'pending'
  currency: 'usd'
  transaction_type: TransactionType
  amount_cents: number
  platform_fee_cents: number
  stripe_processing_fee_cents: number
  net_cents: number
  processing_fee_rate: string
  client_secret: string | null
  base_amount_cents: number
  service_fee_cents: number
  total_cents: number
  organization_net_cents: number
  payment_method_type: 'card' | 'us_bank_account' | 'pending'
  service_fee_refundable: false
  policy_version: string
}

export async function createCanonicalPaymentIntent(input: Input): Promise<CanonicalPaymentResponse> {
  if (!(await enforcePaymentRateLimit(input.userId, 'payment_intent_create', 12, 60))) throw new Error('Too many payment requests. Try again shortly.')
  const amountCents = Math.round(input.amountCents)
  if (amountCents <= 0) throw new Error('amount_cents must be positive')
  let destination = input.destinationAccountId || null
  let platformFeeCents = 0
  let stripeProcessingFeeCents = 0
  let processingFeeRate = 0
  let netCents = amountCents

  if (input.orgId) {
    const [connect, fee] = await Promise.all([
      loadStripeConnectAccountStatus('org', input.orgId),
      calculateOrgPlatformFeeForOrg({ amountCents, orgId: input.orgId, kind: 'session' }),
    ])
    if (!isStripeConnectEnabled(connect)) throw new Error('The organization cannot accept payments yet')
    destination = connect!.stripeAccountId
    platformFeeCents = fee.platformFeeCents
    stripeProcessingFeeCents = fee.stripeProcessingFeeCents
    processingFeeRate = fee.feeRate / 100
    netCents = fee.netCents
  } else if (destination) {
    const fee = calculateOrgPlatformFee({ amountCents, kind: 'marketplace', settings: await getFeeSettings() })
    platformFeeCents = fee.platformFeeCents
    stripeProcessingFeeCents = fee.stripeProcessingFeeCents
    processingFeeRate = fee.feeRate / 100
    netCents = fee.netCents
  }
  if (!destination) throw new Error('The payment recipient has not completed Stripe onboarding')
  const paymentContract = calculateOrganizationPayment(amountCents)

  const { data: existing } = await supabaseAdmin.from('payment_transactions')
    .select('id,status,currency,transaction_type,amount_cents,platform_fee_cents,stripe_processing_fee_cents,net_cents,processing_fee_rate,stripe_payment_intent_id')
    .eq('payer_id', input.payerId || input.userId).eq('source_record_type', input.sourceRecordType)
    .eq('source_record_id', input.sourceRecordId).eq('idempotency_key', input.idempotencyKey).maybeSingle()
  if (existing) {
    if (['pending','processing','succeeded','paid'].includes(String(existing.status))) {
      const prior = existing.stripe_payment_intent_id ? await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id).catch(() => null) : null
      return { transaction_id: existing.id, status: 'pending', currency: 'usd', transaction_type: existing.transaction_type as TransactionType,
        amount_cents: Number(existing.amount_cents),
        stripe_processing_fee_cents: Number(existing.stripe_processing_fee_cents), net_cents: Number(existing.net_cents),
        processing_fee_rate: Number(existing.processing_fee_rate || 0).toFixed(2), client_secret: prior?.client_secret || null,
        ...calculateOrganizationPayment(Number(existing.amount_cents)) }
    }
    throw new Error('This payment request has already been resolved')
  }

  const metadata = {
    source: input.sourceRecordType, transactionType: input.transactionType, sourceRecordId: input.sourceRecordId,
    orgId: input.orgId || '', payerId: input.payerId || input.userId, playerId: input.playerId || '', teamId: input.teamId || '', seasonId: input.seasonId || '',
    title: input.description, amountCents: String(amountCents), platformFeeCents: String(platformFeeCents),
    stripeProcessingFeeCents: String(stripeProcessingFeeCents), netAmountCents: String(netCents),
    processingFeeRate: processingFeeRate.toFixed(4), idempotencyKey: input.idempotencyKey,
    ...organizationPaymentMetadata(paymentContract), ...(input.metadata || {}),
  }
  const intent = await stripe.paymentIntents.create({
    amount: paymentContract.total_cents, currency: 'usd', payment_method_types: ['card', 'us_bank_account'],
    application_fee_amount: paymentContract.application_fee_cents,
    transfer_data: { destination }, on_behalf_of: destination,
    statement_descriptor_suffix: 'COACHES HIVE', metadata,
  }, { idempotencyKey: stripeIdempotencyKey(`${input.transactionType}:${input.sourceRecordId}`, input.userId, input.idempotencyKey) })

  const row = {
    transaction_type: input.transactionType, status: 'pending', org_id: input.orgId || null,
    payer_id: input.payerId || input.userId, player_id: input.playerId || null, athlete_profile_id: input.athleteProfileId || null, team_id: input.teamId || null, season_id: input.seasonId || null,
    source_record_type: input.sourceRecordType, source_record_id: input.sourceRecordId, description: input.description,
    gross_amount_cents: paymentContract.total_cents, amount_cents: amountCents, base_amount_cents: amountCents,
    service_fee_cents: paymentContract.service_fee_cents, total_amount_cents: paymentContract.total_cents,
    organization_net_amount_cents: paymentContract.organization_net_cents, platform_fee_cents: platformFeeCents,
    processing_fee_rate: processingFeeRate,
    stripe_processing_fee_cents: stripeProcessingFeeCents, net_amount_cents: netCents, net_cents: netCents,
    payment_method_type: 'pending', service_fee_refundable: false,
    payment_policy_version: ORGANIZATION_PAYMENT_POLICY_VERSION,
    currency: 'usd', stripe_payment_intent_id: intent.id, idempotency_key: input.idempotencyKey, metadata,
  }
  const { data: transaction, error } = await supabaseAdmin.from('payment_transactions')
    .upsert(row, { onConflict: 'stripe_payment_intent_id' }).select('id,status').single()
  if (error) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined)
    throw new Error(`Unable to create pending transaction: ${error.message}`)
  }
  await auditPaymentAction({ actorUserId: input.userId, organizationId: input.orgId, action: 'payment_intent_created',
    targetType: input.sourceRecordType, targetId: input.sourceRecordId, stripeObjectId: intent.id, result: 'succeeded',
    metadata: { transaction_type: input.transactionType, amount_cents: amountCents } })
  return {
    transaction_id: transaction.id, status: 'pending', currency: 'usd', transaction_type: input.transactionType,
    amount_cents: amountCents, stripe_processing_fee_cents: stripeProcessingFeeCents,
    net_cents: netCents, processing_fee_rate: processingFeeRate.toFixed(2), client_secret: intent.client_secret,
    ...paymentContract,
  }
}
