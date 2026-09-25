import type Stripe from 'stripe'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
import { syncPaymentIntentToLedger } from '@/lib/paymentLedger'

export const RECURRING_FEE_SOURCE = 'organization_recurring_fee'
export const RECURRING_FEE_PLATFORM_PERCENT = 4

export const nextRecurringChargeAt = (from: Date, interval: string) => {
  const next = new Date(from)
  if (interval === 'week') next.setUTCDate(next.getUTCDate() + 7)
  else if (interval === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

const id = (value: unknown) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id
  return null
}

export async function isSuperadminUser(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const { data } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return resolveAdminAccess({
    role: data?.role || user.user_metadata?.role,
    admin_team_role: user.user_metadata?.admin_team_role,
  }).isSuperadmin
}

export async function authorizeRecurringFeePayer(userId: string, athleteId: string, orgId: string) {
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id,owner_user_id,family_id,status')
    .eq('id', athleteId)
    .maybeSingle()
  if (!athlete || String(athlete.status || 'active') !== 'active') return { ok: false as const, reason: 'Athlete not found' }

  const [{ data: orgMembership }, { data: familyMembership }] = await Promise.all([
    supabaseAdmin.from('athlete_organization_memberships').select('athlete_id')
      .eq('athlete_id', athleteId).eq('org_id', orgId).eq('status', 'active').maybeSingle(),
    athlete.family_id
      ? supabaseAdmin.from('family_members').select('user_id,role').eq('family_id', athlete.family_id)
        .eq('user_id', userId).eq('status', 'active').in('role', ['parent', 'guardian']).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!orgMembership) return { ok: false as const, reason: 'Athlete does not belong to this organization' }
  if (athlete.owner_user_id !== userId && !familyMembership) {
    return { ok: false as const, reason: 'Parent or guardian access is required' }
  }
  return { ok: true as const, athlete }
}

export async function canManageOrganizationBilling(userId: string, orgId: string) {
  const { data: allowed } = await supabaseAdmin.rpc('organization_has_permission', {
    p_org_id: orgId, p_permission: 'manage_payments', p_user_id: userId,
  })
  if (allowed) return true
  const { data } = await supabaseAdmin.from('organization_memberships').select('role,status')
    .eq('org_id', orgId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  return ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director'].includes(String(data?.role || ''))
}

async function isNewRecurringEvent(table: 'organization_recurring_fees' | 'organization_recurring_fee_invoices', idValue: string, eventCreated?: number) {
  if (!eventCreated) return true
  const { data } = await supabaseAdmin.from(table).select('last_stripe_event_created').eq('id', idValue).maybeSingle()
  return !data || Number(data.last_stripe_event_created || 0) <= eventCreated
}

export async function syncRecurringFeeSubscription(subscription: Stripe.Subscription, eventType: string, eventCreated?: number) {
  const metadata = subscription.metadata || {}
  if (metadata.source !== RECURRING_FEE_SOURCE) return false
  const feeId = metadata.recurring_fee_id
  if (!feeId) throw new Error('Recurring fee subscription is missing recurring_fee_id')
  if (!(await isNewRecurringEvent('organization_recurring_fees', feeId, eventCreated))) return true
  const customerId = id(subscription.customer)
  const item = subscription.items?.data?.[0]
  const paused = Boolean(subscription.pause_collection)
  const status = paused ? 'paused' : subscription.status === 'canceled' ? 'canceled' : subscription.status
  const { error } = await supabaseAdmin.from('organization_recurring_fees').update({
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price?.id || null,
    status,
    current_period_start: item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    paused_at: paused ? new Date().toISOString() : null,
    last_event_type: eventType,
    ...(eventCreated ? { last_stripe_event_created: eventCreated } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', feeId)
  if (error) throw new Error(error.message)
  return true
}

export async function syncRecurringFeeInvoice(invoice: Stripe.Invoice, eventType: string, eventCreated?: number) {
  const subscriptionId = id((invoice as unknown as { subscription?: unknown }).subscription)
    || id((invoice as unknown as { parent?: { subscription_details?: { subscription?: unknown } } }).parent?.subscription_details?.subscription)
  if (!subscriptionId) return false
  const { data: fee } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,organization_id,workspace_id,athlete_id,payer_user_id,description,amount_cents')
    .eq('stripe_subscription_id', subscriptionId).maybeSingle()
  if (!fee) return false
  const { data: priorInvoice } = await supabaseAdmin.from('organization_recurring_fee_invoices').select('id,last_stripe_event_created').eq('stripe_invoice_id', invoice.id).maybeSingle()
  if (priorInvoice && eventCreated && Number(priorInvoice.last_stripe_event_created || 0) > eventCreated) return true
  const invoicePayment = (invoice as unknown as { payments?: { data?: Array<{ payment?: { payment_intent?: unknown } }> } }).payments?.data?.[0]
  const paymentIntentId = id((invoice as unknown as { payment_intent?: unknown }).payment_intent)
    || id(invoicePayment?.payment?.payment_intent)
  const chargeId = id((invoice as unknown as { charge?: unknown }).charge)
  const paid = eventType === 'invoice.paid' || eventType === 'invoice.payment_succeeded'
  const status = paid ? 'paid' : 'payment_failed'
  const { error } = await supabaseAdmin.from('organization_recurring_fee_invoices').upsert({
    recurring_fee_id: fee.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    amount_due_cents: invoice.amount_due || 0,
    amount_paid_cents: invoice.amount_paid || 0,
    currency: invoice.currency || 'usd',
    status,
    paid_at: paid ? new Date().toISOString() : null,
    attempt_count: Number(invoice.attempt_count || 0),
    next_payment_attempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null,
    ...(eventCreated ? { last_stripe_event_created: eventCreated } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_invoice_id' })
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('organization_recurring_fees').update({
    status: paid ? 'active' : 'past_due',
    last_event_type: eventType,
    ...(eventCreated ? { last_stripe_event_created: eventCreated } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', fee.id)
  if (paid && paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
    const latestChargeId = id(intent.latest_charge)
    if (latestChargeId && !chargeId) {
      await supabaseAdmin.from('organization_recurring_fee_invoices').update({ stripe_charge_id: latestChargeId }).eq('stripe_invoice_id', invoice.id)
    }
    const gross = Number(invoice.amount_paid || fee.amount_cents || 0)
    const platformFee = Math.round(gross * RECURRING_FEE_PLATFORM_PERCENT / 100)
    await syncPaymentIntentToLedger({
      ...intent,
      metadata: {
        ...(intent.metadata || {}),
        source: RECURRING_FEE_SOURCE,
        transactionType: 'dues',
        sourceRecordId: fee.id,
        recurringFeeId: fee.id,
        orgId: fee.organization_id,
        workspaceId: fee.workspace_id || '',
        athleteProfileId: fee.athlete_id,
        payerId: fee.payer_user_id,
        description: fee.description,
        platformFeeCents: String(platformFee),
        netAmountCents: String(Math.max(0, gross - platformFee)),
      },
    } as Stripe.PaymentIntent, 'succeeded')
  }
  return true
}

export async function syncRecurringFeePaymentMethod(paymentMethod: Stripe.PaymentMethod, eventType: string, eventCreated?: number) {
  const customerId = id(paymentMethod.customer)
  if (!customerId) return false
  const { data } = await supabaseAdmin.from('organization_recurring_fees').update({
    payment_method_status: 'updated', last_event_type: eventType, ...(eventCreated ? { last_stripe_event_created: eventCreated } : {}), updated_at: new Date().toISOString(),
  }).eq('stripe_customer_id', customerId).in('status', ['active', 'trialing', 'past_due', 'paused']).select('id')
  return Boolean(data?.length)
}

export async function syncRecurringFeeChargeOutcome(charge: Stripe.Charge, eventType: string, eventCreated?: number) {
  const paymentIntentId = id(charge.payment_intent)
  if (!paymentIntentId) return false
  const { data: invoice } = await supabaseAdmin.from('organization_recurring_fee_invoices')
    .select('id,recurring_fee_id,amount_paid_cents,last_stripe_event_created').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
  if (!invoice) return false
  if (eventCreated && Number(invoice.last_stripe_event_created || 0) > eventCreated) return true
  const refunded = Number(charge.amount_refunded || 0)
  const status = eventType.startsWith('charge.dispute')
    ? 'disputed'
    : refunded >= Number(invoice.amount_paid_cents || charge.amount) ? 'refunded' : 'partially_refunded'
  await supabaseAdmin.from('organization_recurring_fee_invoices').update({
    stripe_charge_id: charge.id, refunded_amount_cents: refunded, status, ...(eventCreated ? { last_stripe_event_created: eventCreated } : {}), updated_at: new Date().toISOString(),
  }).eq('id', invoice.id)
  await supabaseAdmin.from('organization_recurring_fees').update({
    last_event_type: eventType, updated_at: new Date().toISOString(),
  }).eq('id', invoice.recurring_fee_id)
  return true
}

export async function syncRecurringFeeDispute(dispute: Stripe.Dispute, eventType: string, eventCreated?: number) {
  const chargeId = id(dispute.charge)
  if (!chargeId) return false
  const { data: invoice } = await supabaseAdmin.from('organization_recurring_fee_invoices')
    .select('id,recurring_fee_id,last_stripe_event_created').eq('stripe_charge_id', chargeId).maybeSingle()
  if (!invoice) return false
  if (eventCreated && Number(invoice.last_stripe_event_created || 0) > eventCreated) return true
  await supabaseAdmin.from('organization_recurring_fee_invoices').update({
    status: dispute.status === 'won' ? 'paid' : dispute.status === 'lost' ? 'disputed_lost' : 'disputed',
    stripe_dispute_id: dispute.id, ...(eventCreated ? { last_stripe_event_created: eventCreated } : {}), updated_at: new Date().toISOString(),
  }).eq('id', invoice.id)
  await supabaseAdmin.from('organization_recurring_fees').update({ last_event_type: eventType, updated_at: new Date().toISOString() }).eq('id', invoice.recurring_fee_id)
  return true
}
