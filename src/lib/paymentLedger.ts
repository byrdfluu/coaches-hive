import type Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPaymentReceiptEmail, sendTransactionalEmail } from '@/lib/email'
import { syncFamilyInstallmentSucceeded } from '@/lib/familyPaymentPlans'

export type TransactionType = 'registration' | 'dues' | 'event' | 'facility' | 'fundraising' | 'equipment' | 'travel' | 'other'

const TYPES = new Set<TransactionType>(['registration', 'dues', 'event', 'facility', 'fundraising', 'equipment', 'travel', 'other'])

const sourceType = (metadata: Stripe.Metadata): TransactionType => {
  const explicit = String(metadata.transactionType || metadata.transaction_type || '') as TransactionType
  if (TYPES.has(explicit)) return explicit
  const source = String(metadata.source || metadata.checkout_type || '').toLowerCase()
  if (source.includes('enrollment') || source.includes('registration') || source.includes('tryout') || source.includes('program')) return 'registration'
  if (source.includes('dues') || source.includes('fee')) return 'dues'
  if (source.includes('event') || source.includes('tournament') || source.includes('camp') || source.includes('clinic')) return 'event'
  if (source.includes('facility') || source.includes('booking')) return 'facility'
  if (source.includes('fundrais') || source.includes('donation')) return 'fundraising'
  if (source.includes('equipment') || source.includes('marketplace') || source.includes('cart')) return 'equipment'
  if (source.includes('travel')) return 'travel'
  return 'other'
}

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const cents = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback
}

export async function syncPaymentIntentToLedger(intent: Stripe.PaymentIntent, status?: string) {
  const metadata = intent.metadata || {}
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge as Stripe.Charge : null
  const balanceTransaction = charge && typeof charge.balance_transaction === 'object'
    ? charge.balance_transaction as Stripe.BalanceTransaction
    : null
  const card = charge?.payment_method_details?.type === 'card' ? charge.payment_method_details.card : null
  const amountCents = cents(intent.amount)
  const platformFeeCents = cents(metadata.platformFeeCents ?? metadata.platform_fee_cents ?? intent.application_fee_amount)
  const stripeFeeCents = balanceTransaction?.fee != null
    ? cents(balanceTransaction.fee)
    : text(metadata.stripeProcessingFeeCents ?? metadata.stripe_processing_fee_cents)
      ? cents(metadata.stripeProcessingFeeCents ?? metadata.stripe_processing_fee_cents)
    : null
  const netCents = cents(metadata.netAmountCents ?? metadata.net_cents, Math.max(0, amountCents - platformFeeCents))
  const normalizedStatus = status || (intent.status === 'succeeded' ? 'succeeded' : intent.status === 'processing' ? 'processing' : intent.status === 'canceled' ? 'canceled' : 'pending')
  const { data: existingTransaction } = await supabaseAdmin
    .from('payment_transactions')
    .select('id,status')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle()
  const existingStatus = String(existingTransaction?.status || '')
  const effectiveStatus = ['succeeded', 'partially_refunded', 'refunded'].includes(existingStatus)
    && !['partially_refunded', 'refunded'].includes(normalizedStatus)
    ? existingStatus
    : normalizedStatus

  const row = {
    transaction_type: sourceType(metadata),
    status: effectiveStatus,
    org_id: text(metadata.orgId ?? metadata.org_id),
    payer_id: text(metadata.payerId ?? metadata.payer_id ?? metadata.athleteId ?? metadata.athlete_id),
    player_id: text(metadata.playerId ?? metadata.player_id ?? metadata.athleteId ?? metadata.athlete_id),
    athlete_profile_id: text(metadata.athleteProfileId ?? metadata.athlete_profile_id),
    team_id: text(metadata.teamId ?? metadata.team_id),
    season_id: text(metadata.seasonId ?? metadata.season_id),
    source_record_type: text(metadata.source ?? metadata.checkout_type) || 'stripe_payment_intent',
    source_record_id: text(metadata.sourceRecordId ?? metadata.source_record_id ?? metadata.assignmentId ?? metadata.entityId ?? metadata.entity_id),
    description: text(metadata.title ?? metadata.description) || 'Coaches Hive payment',
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    stripe_processing_fee_cents: stripeFeeCents,
    net_cents: netCents,
    currency: intent.currency || 'usd',
    stripe_payment_intent_id: intent.id,
    stripe_charge_id: charge?.id || (typeof intent.latest_charge === 'string' ? intent.latest_charge : null),
    payment_method_brand: card?.brand || null,
    payment_method_last4: card?.last4 || null,
    failure_code: intent.last_payment_error?.code || null,
    failure_message: intent.last_payment_error?.message || null,
    occurred_at: new Date(intent.created * 1000).toISOString(),
    metadata: { ...metadata },
    updated_at: new Date().toISOString(),
  }

  const { data: transaction, error } = await supabaseAdmin
    .from('payment_transactions')
    .upsert(row, { onConflict: 'stripe_payment_intent_id' })
    .select('id')
    .single()
  if (error) throw new Error(`Unable to synchronize payment ledger: ${error.message}`)
  if (effectiveStatus !== 'succeeded' || (existingStatus === 'succeeded' && normalizedStatus !== 'succeeded')) return transaction

  await syncFamilyInstallmentSucceeded(intent, transaction.id)

  const obligationId = text(metadata.obligationId)
  if (obligationId) {
    const { error: allocationError } = await supabaseAdmin.from('org_event_payment_allocations').insert({
      obligation_id: obligationId, transaction_id: transaction.id, amount_cents: amountCents,
    })
    if (!allocationError) {
      const { data: obligation } = await supabaseAdmin.from('org_event_obligations').select('amount_due_cents,amount_paid_cents').eq('id', obligationId).maybeSingle()
      if (obligation) {
        const paid = Math.min(Number(obligation.amount_due_cents), Number(obligation.amount_paid_cents || 0) + amountCents)
        await supabaseAdmin.from('org_event_obligations').update({
          amount_paid_cents: paid, status: paid >= Number(obligation.amount_due_cents) ? 'paid' : 'partial', updated_at: new Date().toISOString(),
        }).eq('id', obligationId)
      }
    }
  }

  const campaignId = text(metadata.campaignId)
  if (campaignId) {
    await supabaseAdmin.from('fundraising_contributions').upsert({
      campaign_id: campaignId, transaction_id: transaction.id, contributor_id: text(metadata.payerId),
      contributor_name: text(metadata.contributorName), contributor_email: text(metadata.contributorEmail),
      contributor_type: ['parent','business','external_individual'].includes(String(metadata.contributorType)) ? metadata.contributorType : 'external_individual',
      amount_cents: amountCents, anonymous: metadata.anonymous === 'true',
    }, { onConflict: 'transaction_id' })
  }

  const bookingId = text(metadata.bookingId)
  if (bookingId) {
    await supabaseAdmin.from('facility_bookings').update({ transaction_id: transaction.id, status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', bookingId)
  }

  const installmentId = text(metadata.installmentId ?? metadata.installment_id)
  if (installmentId) {
    await supabaseAdmin.from('org_dues_installments').update({
      amount_paid_cents: amountCents, status: 'paid', stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString(),
    }).eq('id', installmentId)
  }

  const registrationSubmissionId = text(metadata.submissionId ?? metadata.submission_id)
  if (registrationSubmissionId) {
    const paidAt = new Date().toISOString()
    const { data: submission } = await supabaseAdmin.from('org_enrollment_submissions')
      .update({ payment_status: 'paid', amount_paid_cents: amountCents, platform_fee_cents: platformFeeCents, stripe_processing_fee_cents: stripeFeeCents, net_cents: netCents, stripe_payment_intent_id: intent.id, paid_at: paidAt })
      .eq('id', registrationSubmissionId).select('id,form_id,player_id').maybeSingle()
    if (submission?.player_id) {
      const { data: form } = await supabaseAdmin.from('org_enrollment_forms').select('team_id').eq('id', submission.form_id).maybeSingle()
      if (form?.team_id) {
        await supabaseAdmin.from('org_team_members').upsert({ team_id: form.team_id, athlete_id: submission.player_id }, { onConflict: 'team_id,athlete_id' })
      }
    }
  }

  const collectionObligationId = text(metadata.collectionObligationId ?? metadata.collection_obligation_id)
  if (collectionObligationId && (row.transaction_type === 'equipment' || row.transaction_type === 'travel')) {
    const { error: collectionError } = await supabaseAdmin.rpc('complete_org_payment_collection_obligation', {
      p_obligation_id: collectionObligationId,
      p_transaction_id: transaction.id,
      p_amount_cents: amountCents,
    })
    if (collectionError) throw new Error(`Unable to fulfill ${row.transaction_type} payment: ${collectionError.message}`)
  }

  const { data: existingReceipt } = await supabaseAdmin.from('payment_receipts').select('id').eq('stripe_payment_intent_id', intent.id).maybeSingle()
  let receiptId = existingReceipt?.id || null
  let receiptCreated = false
  if (!receiptId) {
    const { data: receipt } = await supabaseAdmin.from('payment_receipts').insert({
      org_id: row.org_id, payer_id: row.payer_id, amount: amountCents / 100, amount_cents: amountCents,
      currency: row.currency, status: 'paid', stripe_payment_intent_id: intent.id, stripe_charge_id: row.stripe_charge_id,
      metadata: { ...metadata, amount_cents: amountCents, platform_fee_cents: platformFeeCents, stripe_processing_fee_cents: stripeFeeCents, net_cents: netCents },
    }).select('id').maybeSingle()
    receiptId = receipt?.id || null
    receiptCreated = Boolean(receiptId)
  }
  let recipientEmail = text(metadata.contributorEmail)
  let recipientName = text(metadata.contributorName)
  if (!recipientEmail && row.payer_id) {
    const { data: payer } = await supabaseAdmin.from('profiles').select('email,full_name').eq('id', row.payer_id).maybeSingle()
    recipientEmail = payer?.email || null; recipientName = payer?.full_name || null
  }
  if (recipientEmail && receiptCreated) {
    if (campaignId) {
      const taxNote = metadata.taxDeductible === 'true'
        ? 'Keep this acknowledgment for your records. Tax deductibility depends on the recipient organization and your circumstances.'
        : 'This contribution is not tax-deductible.'
      await sendTransactionalEmail({
        toEmail: recipientEmail, toName: recipientName, subject: `Contribution received: ${row.description}`,
        tag: 'fundraising_receipt', textBody: `${row.description}: $${(amountCents/100).toFixed(2)}. ${taxNote}`,
        htmlBody: `<p>Thank you for your contribution of <strong>$${(amountCents/100).toFixed(2)}</strong>.</p><p>${taxNote}</p>`,
        metadata: { transaction_id: transaction.id, receipt_id: receiptId || '' },
      })
    } else {
      await sendPaymentReceiptEmail({ toEmail: recipientEmail, toName: recipientName, amount: amountCents/100, currency: row.currency, receiptId, description: row.description, dashboardUrl: '/athlete/payments' })
    }
  }
  return transaction
}
