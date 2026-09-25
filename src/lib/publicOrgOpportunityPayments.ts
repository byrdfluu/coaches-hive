import type Stripe from 'stripe'
import { createHash } from 'node:crypto'
import stripe from '@/lib/stripeServer'
import { calculateOrgPlatformFeeForOrg, centsToDollars } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrganizationPayment, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'

type OrgPaymentInput = {
  amountCents: number
  orgId: string
  source: 'tryout_registration' | 'enrollment_application'
  entityId: string
  title: string
  athleteName?: string | null
  athleteEmail?: string | null
}

type VerifiedPayment = {
  intent: Stripe.PaymentIntent
  amount: number
  platformFee: number
  netAmount: number
  platformFeeCents: number
  feeRate: number
  orgTier: string
  chargeId: string | null
  paymentMethodBrand: string | null
  paymentMethodLast4: string | null
}

export async function createOrgOpportunityPaymentIntent({
  amountCents,
  orgId,
  source,
  entityId,
  title,
  athleteName,
  athleteEmail,
}: OrgPaymentInput) {
  const amount = Math.max(0, Math.round(Number(amountCents) || 0))
  if (!amount) return { clientSecret: null, free: true }

  const [{ data: orgSettings, error: orgError }, connectStatus] = await Promise.all([
    supabaseAdmin
      .from('org_settings')
      .select('plan')
      .eq('org_id', orgId)
      .maybeSingle(),
    loadStripeConnectAccountStatus('org', orgId),
  ])

  if (orgError) throw new Error('Unable to load organization payment settings')
  if (!isStripeConnectEnabled(connectStatus)) {
    throw new Error('Organization must finish Stripe Connect onboarding before accepting paid registrations.')
  }

  const feeBreakdown = await calculateOrgPlatformFeeForOrg({
    amountCents: amount,
    orgId,
    tier: orgSettings?.plan,
    kind: 'session',
  })
  const paymentContract = calculateOrganizationPayment(amount)

  const idempotencyKey = createHash('sha256')
    .update(`${source}:${entityId}:${athleteEmail?.trim().toLowerCase() || 'anonymous'}`)
    .digest('hex')

  const paymentIntent = await stripe.paymentIntents.create({
    amount: paymentContract.total_cents,
    currency: 'usd',
    payment_method_types: ['card', 'us_bank_account'],
    application_fee_amount: paymentContract.application_fee_cents,
    transfer_data: {
      destination: connectStatus!.stripeAccountId,
    },
    on_behalf_of: connectStatus!.stripeAccountId,
    statement_descriptor_suffix: 'COACHES HIVE',
    metadata: {
      source,
      orgId,
      entityId,
      title,
      athleteName: athleteName || '',
      athleteEmail: athleteEmail || '',
      platformFeeCents: String(feeBreakdown.platformFeeCents),
      platformFeeRate: String(feeBreakdown.feeRate),
      netAmountCents: String(feeBreakdown.netCents),
      orgTier: feeBreakdown.tier,
      feeCategory: 'session',
      ...organizationPaymentMetadata(paymentContract),
    },
  }, {
    // Public registration clients may retry this request after a network error.
    // The stable key prevents those retries from creating duplicate intents.
    idempotencyKey: `org-opportunity:${idempotencyKey}`,
  })

  return {
    clientSecret: paymentIntent.client_secret,
    free: false,
    amountCents: amount,
    platformFeeCents: feeBreakdown.platformFeeCents,
    platformFeeRate: feeBreakdown.feeRate,
  }
}

export async function verifyOrgOpportunityPayment({
  paymentIntentId,
  expectedAmountCents,
  orgId,
  source,
  entityId,
}: {
  paymentIntentId: string
  expectedAmountCents: number
  orgId: string
  source: 'tryout_registration' | 'enrollment_application'
  entityId: string
}): Promise<VerifiedPayment> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  })

  if (intent.status !== 'succeeded') throw new Error('Payment has not completed yet.')
  if (intent.currency !== 'usd') throw new Error('Payment currency must be USD.')
  const paymentContract = calculateOrganizationPayment(expectedAmountCents)
  if (intent.amount !== paymentContract.total_cents) throw new Error('Payment amount does not match the registration fee.')
  if (String(intent.metadata?.source || '') !== source) throw new Error('Payment source does not match this checkout.')
  if (String(intent.metadata?.orgId || '') !== orgId) throw new Error('Payment organization does not match this checkout.')
  if (String(intent.metadata?.entityId || '') !== entityId) throw new Error('Payment item does not match this checkout.')

  const expectedFee = paymentContract.application_fee_cents
  if (typeof intent.application_fee_amount === 'number' && Math.abs(intent.application_fee_amount - expectedFee) > 1) {
    throw new Error('Platform fee does not match the registration fee.')
  }

  const charge = intent.latest_charge as Stripe.Charge | string | null
  const chargeId = typeof charge === 'string' ? charge : charge?.id || null
  const paymentMethodDetails = typeof charge === 'string' ? null : charge?.payment_method_details
  const card = paymentMethodDetails?.type === 'card' ? paymentMethodDetails.card : null
  const platformFeeCents = paymentContract.platform_fee_cents
  const amount = centsToDollars(paymentContract.base_amount_cents)
  const platformFee = centsToDollars(platformFeeCents)

  return {
    intent,
    amount,
    platformFee,
    netAmount: centsToDollars(paymentContract.organization_net_cents),
    platformFeeCents,
    feeRate: Number(intent.metadata?.platformFeeRate || 0),
    orgTier: String(intent.metadata?.orgTier || ''),
    chargeId,
    paymentMethodBrand: card?.brand || null,
    paymentMethodLast4: card?.last4 || null,
  }
}
