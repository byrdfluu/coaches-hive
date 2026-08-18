import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrgPlatformFeeForOrg, calculateStripeProcessingFeeCents, getFeeSettings } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { stripeIdempotencyKey } from '@/lib/mobilePaymentApi'
import type { TransactionType } from '@/lib/paymentLedger'

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
  teamId?: string | null
  seasonId?: string | null
  destinationAccountId?: string | null
  facilityFeeRate?: number | null
  facilityFeeCapCents?: number | null
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
}

export async function createCanonicalPaymentIntent(input: Input): Promise<CanonicalPaymentResponse> {
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
  } else if (destination && input.facilityFeeRate != null) {
    processingFeeRate = Math.max(0, Number(input.facilityFeeRate))
    platformFeeCents = Math.min(Math.round(amountCents * processingFeeRate), Math.max(0, Number(input.facilityFeeCapCents ?? Number.MAX_SAFE_INTEGER)))
    stripeProcessingFeeCents = calculateStripeProcessingFeeCents(amountCents, await getFeeSettings())
    netCents = Math.max(0, amountCents - platformFeeCents - stripeProcessingFeeCents)
  }
  if (!destination) throw new Error('The payment recipient has not completed Stripe onboarding')

  const metadata = {
    source: input.sourceRecordType, transactionType: input.transactionType, sourceRecordId: input.sourceRecordId,
    orgId: input.orgId || '', payerId: input.payerId || input.userId, playerId: input.playerId || '', teamId: input.teamId || '', seasonId: input.seasonId || '',
    title: input.description, amountCents: String(amountCents), platformFeeCents: String(platformFeeCents),
    stripeProcessingFeeCents: String(stripeProcessingFeeCents), netAmountCents: String(netCents),
    processingFeeRate: processingFeeRate.toFixed(4), idempotencyKey: input.idempotencyKey, ...(input.metadata || {}),
  }
  const intent = await stripe.paymentIntents.create({
    amount: amountCents, currency: 'usd', automatic_payment_methods: { enabled: true },
    application_fee_amount: platformFeeCents, transfer_data: { destination }, metadata,
  }, { idempotencyKey: stripeIdempotencyKey(`${input.transactionType}:${input.sourceRecordId}`, input.userId, input.idempotencyKey) })

  const row = {
    transaction_type: input.transactionType, status: 'pending', org_id: input.orgId || null,
    payer_id: input.payerId || input.userId, player_id: input.playerId || null, team_id: input.teamId || null, season_id: input.seasonId || null,
    source_record_type: input.sourceRecordType, source_record_id: input.sourceRecordId, description: input.description,
    gross_amount_cents: amountCents, amount_cents: amountCents, platform_fee_cents: platformFeeCents,
    stripe_processing_fee_cents: stripeProcessingFeeCents, net_amount_cents: netCents, net_cents: netCents,
    currency: 'usd', stripe_payment_intent_id: intent.id, metadata,
  }
  const { data: transaction, error } = await supabaseAdmin.from('payment_transactions')
    .upsert(row, { onConflict: 'stripe_payment_intent_id' }).select('id,status').single()
  if (error) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined)
    throw new Error(`Unable to create pending transaction: ${error.message}`)
  }
  return {
    transaction_id: transaction.id, status: 'pending', currency: 'usd', transaction_type: input.transactionType,
    amount_cents: amountCents, platform_fee_cents: platformFeeCents, stripe_processing_fee_cents: stripeProcessingFeeCents,
    net_cents: netCents, processing_fee_rate: processingFeeRate.toFixed(2), client_secret: intent.client_secret,
  }
}
