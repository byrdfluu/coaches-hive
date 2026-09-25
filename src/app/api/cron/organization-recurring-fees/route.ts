import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrganizationPayment, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'
import { nextRecurringChargeAt, RECURRING_FEE_SOURCE } from '@/lib/recurringFees'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const { data: fees, error } = await supabaseAdmin.from('organization_recurring_fees').select('*')
    .eq('billing_mode', 'scheduled_payment_intent').in('status', ['active', 'past_due'])
    .lte('next_charge_at', now.toISOString()).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let charged = 0
  let failed = 0
  for (const fee of fees || []) {
    if (!fee.stripe_customer_id || !fee.stripe_payment_method_id || !fee.stripe_connected_account_id) continue
    const periodKey = new Date(fee.next_charge_at).toISOString().slice(0, 10)
    const contract = calculateOrganizationPayment(Number(fee.amount_cents))
    const metadata = {
      source: RECURRING_FEE_SOURCE, transactionType: 'dues', sourceRecordId: fee.id,
      recurringFeeId: fee.id, orgId: fee.organization_id, workspaceId: fee.workspace_id || '',
      athleteProfileId: fee.athlete_id, payerId: fee.payer_user_id, description: fee.description,
      ...organizationPaymentMetadata(contract),
    }
    try {
      const intent = await stripe.paymentIntents.create({
        amount: contract.total_cents, currency: fee.currency || 'usd', customer: fee.stripe_customer_id,
        payment_method: fee.stripe_payment_method_id, confirm: true, off_session: true,
        application_fee_amount: contract.application_fee_cents,
        transfer_data: { destination: fee.stripe_connected_account_id }, on_behalf_of: fee.stripe_connected_account_id,
        statement_descriptor_suffix: 'COACHES HIVE', metadata,
      }, { idempotencyKey: `org-recurring:${fee.id}:${periodKey}` })
      await supabaseAdmin.from('organization_recurring_fee_invoices').upsert({
        recurring_fee_id: fee.id, period_key: periodKey, stripe_payment_intent_id: intent.id,
        amount_due_cents: contract.total_cents, amount_paid_cents: intent.status === 'succeeded' ? contract.total_cents : 0,
        base_amount_cents: contract.base_amount_cents, service_fee_cents: contract.service_fee_cents,
        platform_fee_cents: contract.platform_fee_cents, organization_net_cents: contract.organization_net_cents,
        currency: fee.currency || 'usd', status: intent.status === 'succeeded' ? 'paid' : intent.status, updated_at: now.toISOString(),
      }, { onConflict: 'recurring_fee_id,period_key' })
      await supabaseAdmin.from('organization_recurring_fees').update({
        status: intent.status === 'succeeded' || intent.status === 'processing' ? 'active' : 'past_due',
        last_charge_at: now.toISOString(), next_charge_at: nextRecurringChargeAt(new Date(fee.next_charge_at), fee.interval).toISOString(),
        last_event_type: `scheduled_payment_intent.${intent.status}`, updated_at: now.toISOString(),
      }).eq('id', fee.id).eq('next_charge_at', fee.next_charge_at)
      charged += 1
    } catch (chargeError) {
      failed += 1
      await supabaseAdmin.from('organization_recurring_fees').update({ status: 'past_due', last_event_type: 'scheduled_payment_intent.failed', updated_at: now.toISOString() }).eq('id', fee.id)
    }
  }
  return NextResponse.json({ processed: (fees || []).length, charged, failed })
}
