import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrgPlatformFeeForOrg, calculateStripeProcessingFeeCents, getFeeSettings } from '@/lib/orgPlatformFees'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'

const familyInstallmentId = (intent: Stripe.PaymentIntent) =>
  String(intent.metadata?.familyPaymentPlanInstallmentId || intent.metadata?.family_payment_plan_installment_id || '').trim()

export async function confirmFamilyPaymentPlanConsent(session: Stripe.Checkout.Session) {
  if (session.metadata?.checkout_type !== 'family_installment') return false
  const enrollmentId = String(session.metadata.enrollment_id || '').trim()
  const installmentId = String(session.metadata.installment_id || '').trim()
  if (!enrollmentId || !installmentId) throw new Error('Family installment checkout metadata is incomplete')
  if (session.consent?.terms_of_service !== 'accepted') throw new Error('Family installment authorization was not accepted')
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null
  const now = new Date().toISOString()
  await Promise.all([
    supabaseAdmin.from('family_payment_plan_enrollments').update({ autopay_consent_confirmed_at: now, autopay_consent_checkout_session_id: session.id, updated_at: now }).eq('id', enrollmentId),
    supabaseAdmin.from('family_payment_plan_installments').update({ status: 'processing', stripe_payment_intent_id: paymentIntentId, updated_at: now }).eq('id', installmentId).neq('status', 'paid'),
  ])
  return true
}

export async function reconcileFamilyPaymentPlanEnrollment(enrollmentId: string) {
  const [{ data: enrollment }, { data: installments }] = await Promise.all([
    supabaseAdmin.from('family_payment_plan_enrollments').select('id,total_amount_cents,source_type,source_id,athlete_profile_id').eq('id', enrollmentId).maybeSingle(),
    supabaseAdmin.from('family_payment_plan_installments').select('amount_cents,status').eq('enrollment_id', enrollmentId),
  ])
  if (!enrollment) return
  const paidCents = (installments || []).filter((row) => row.status === 'paid').reduce((sum, row) => sum + Number(row.amount_cents || 0), 0)
  const hasPastDue = (installments || []).some((row) => ['failed', 'past_due'].includes(String(row.status)))
  const status = paidCents >= Number(enrollment.total_amount_cents) ? 'paid' : hasPastDue ? 'past_due' : paidCents > 0 ? 'active' : 'pending_first_payment'
  await supabaseAdmin.from('family_payment_plan_enrollments').update({ amount_paid_cents: paidCents, status, updated_at: new Date().toISOString() }).eq('id', enrollmentId)
  if (enrollment.source_type === 'program' && paidCents > 0) {
    await supabaseAdmin.from('program_registrations').update({ status: 'paid' })
      .eq('program_id', enrollment.source_id).eq('athlete_profile_id', enrollment.athlete_profile_id).neq('status', 'canceled')
  }
}

export async function syncFamilyInstallmentSucceeded(intent: Stripe.PaymentIntent, transactionId: string) {
  const installmentId = familyInstallmentId(intent)
  if (!installmentId) return false
  const paymentMethodId = typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id || null
  const customerId = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id || null
  const { data: installment } = await supabaseAdmin.from('family_payment_plan_installments')
    .update({ status: 'paid', transaction_id: transactionId, stripe_payment_intent_id: intent.id, failure_reason: null, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', installmentId).select('enrollment_id').maybeSingle()
  if (!installment?.enrollment_id) return true
  if (customerId && paymentMethodId) {
    await supabaseAdmin.from('family_payment_plan_enrollments').update({ stripe_customer_id: customerId, stripe_payment_method_id: paymentMethodId, updated_at: new Date().toISOString() }).eq('id', installment.enrollment_id)
  }
  await reconcileFamilyPaymentPlanEnrollment(installment.enrollment_id)
  return true
}

export async function syncFamilyInstallmentFailed(intent: Stripe.PaymentIntent) {
  const installmentId = familyInstallmentId(intent)
  if (!installmentId) return false
  const requiresAction = intent.status === 'requires_action' || intent.last_payment_error?.code === 'authentication_required'
  const reason = intent.last_payment_error?.message || (requiresAction ? 'Customer authentication is required.' : 'Stripe could not complete this installment.')
  const { data: installment } = await supabaseAdmin.from('family_payment_plan_installments')
    .update({ status: requiresAction ? 'requires_action' : 'past_due', stripe_payment_intent_id: intent.id, failure_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', installmentId).select('enrollment_id').maybeSingle()
  if (installment?.enrollment_id) await reconcileFamilyPaymentPlanEnrollment(installment.enrollment_id)
  return true
}

export async function syncFamilyInstallmentRefunded(paymentIntentId: string) {
  const { data: installment } = await supabaseAdmin.from('family_payment_plan_installments')
    .update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('stripe_payment_intent_id', paymentIntentId).select('enrollment_id').maybeSingle()
  if (installment?.enrollment_id) await reconcileFamilyPaymentPlanEnrollment(installment.enrollment_id)
}

export async function dispatchDueFamilyInstallments(now = new Date()) {
  const { data: due, error } = await supabaseAdmin.from('family_payment_plan_installments')
    .select('id,enrollment_id,sequence_number,amount_cents,status,attempt_count,family_payment_plan_enrollments(*)')
    .in('status', ['scheduled', 'failed', 'past_due']).lte('due_at', now.toISOString()).lt('attempt_count', 4).order('due_at').limit(250)
  if (error) throw new Error(error.message)
  let processing = 0, failed = 0, skipped = 0
  for (const row of due || []) {
    const enrollment = Array.isArray(row.family_payment_plan_enrollments) ? row.family_payment_plan_enrollments[0] : row.family_payment_plan_enrollments
    if (!enrollment || !enrollment.stripe_customer_id || !enrollment.stripe_payment_method_id || !enrollment.stripe_connected_account_id || enrollment.status === 'canceled') { skipped += 1; continue }
    const attempt = Number(row.attempt_count || 0) + 1
    const { data: claimed } = await supabaseAdmin.from('family_payment_plan_installments')
      .update({ status: 'processing', attempt_count: attempt, updated_at: now.toISOString() }).eq('id', row.id)
      .in('status', ['scheduled', 'failed', 'past_due']).eq('attempt_count', row.attempt_count).select('id').maybeSingle()
    if (!claimed) { skipped += 1; continue }
    try {
      let destination: string | null = enrollment.stripe_connected_account_id
      let platformFeeCents = 0
      let stripeProcessingFeeCents = 0
      let netCents = Number(row.amount_cents)
      let processingFeeRate = 0.04
      if (enrollment.org_id) {
        const [connect, fees] = await Promise.all([
          loadStripeConnectAccountStatus('org', enrollment.org_id),
          calculateOrgPlatformFeeForOrg({ amountCents: Number(row.amount_cents), orgId: enrollment.org_id, kind: enrollment.source_type === 'program' ? 'program' : 'org_fee' }),
        ])
        if (!isStripeConnectEnabled(connect)) throw new Error('Organization Stripe Connect account is unavailable')
        if (connect!.stripeAccountId !== destination) throw new Error('Stored payment destination no longer matches the organization Connect account')
        platformFeeCents = fees.platformFeeCents; stripeProcessingFeeCents = fees.stripeProcessingFeeCents; netCents = fees.netCents; processingFeeRate = fees.feeRate / 100
      } else if (enrollment.coach_id) {
        const connect = await loadStripeConnectAccountStatus('coach', enrollment.coach_id)
        if (!isStripeConnectEnabled(connect)) throw new Error('Coach Stripe Connect account is unavailable')
        if (connect!.stripeAccountId !== destination) throw new Error('Stored payment destination no longer matches the coach Connect account')
        const settings = await getFeeSettings(); platformFeeCents = Math.round(Number(row.amount_cents) * 0.04); stripeProcessingFeeCents = calculateStripeProcessingFeeCents(Number(row.amount_cents), settings); netCents = Math.max(0, Number(row.amount_cents) - platformFeeCents - stripeProcessingFeeCents)
      }
      if (!destination) throw new Error('Payment recipient is unavailable')
      const intent = await stripe.paymentIntents.create({
        amount: Number(row.amount_cents), currency: 'usd', customer: enrollment.stripe_customer_id,
        payment_method: enrollment.stripe_payment_method_id, confirm: true, off_session: true,
        application_fee_amount: platformFeeCents, transfer_data: { destination },
        metadata: {
          source: 'family_payment_plan_installment', transactionType: enrollment.source_type === 'program' ? 'registration' : 'dues',
          sourceRecordId: row.id, familyPaymentPlanInstallmentId: row.id, familyPaymentPlanEnrollmentId: enrollment.id,
          payerId: enrollment.payer_id, athleteProfileId: enrollment.athlete_profile_id, orgId: enrollment.org_id || '', coachId: enrollment.coach_id || '',
          title: `Installment ${row.sequence_number} of ${enrollment.installment_count}`, amountCents: String(row.amount_cents),
          platformFeeCents: String(platformFeeCents), stripeProcessingFeeCents: String(stripeProcessingFeeCents), netAmountCents: String(netCents), processingFeeRate: processingFeeRate.toFixed(4),
        },
      }, { idempotencyKey: `family-installment:${row.id}:attempt:${attempt}` })
      await supabaseAdmin.from('family_payment_plan_installments').update({ stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString() }).eq('id', row.id)
      processing += 1
    } catch (chargeError) {
      const stripeIntent = (chargeError as { payment_intent?: Stripe.PaymentIntent })?.payment_intent
      const requiresAction = stripeIntent?.status === 'requires_action' || (chargeError as { code?: string })?.code === 'authentication_required'
      await supabaseAdmin.from('family_payment_plan_installments').update({ status: requiresAction ? 'requires_action' : 'past_due', stripe_payment_intent_id: stripeIntent?.id || null, failure_reason: chargeError instanceof Error ? chargeError.message : 'Payment failed', updated_at: new Date().toISOString() }).eq('id', row.id)
      await reconcileFamilyPaymentPlanEnrollment(row.enrollment_id); failed += 1
    }
  }
  return { processed: (due || []).length, processing, failed, skipped }
}
