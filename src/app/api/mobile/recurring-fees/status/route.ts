import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { canManageOrganizationBilling, isSuperadminUser } from '@/lib/recurringFees'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOrganizationPayment } from '@/lib/organizationPaymentPolicy'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401)
  const feeId = new URL(request.url).searchParams.get('fee_id')?.trim()
  if (!feeId) return mobileError('fee_id is required', 422)
  const { data: fee, error } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,organization_id,workspace_id,athlete_id,payer_user_id,offer_id,offer_assignment_id,amount_cents,currency,interval,description,start_date,status,payment_method_status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,paused_at,created_at,updated_at')
    .eq('id', feeId).maybeSingle()
  if (error) return mobileError('Unable to load recurring fee status', 500)
  if (!fee) return mobileError('Recurring fee not found', 404)
  const authorized = fee.payer_user_id === user.id || await isSuperadminUser(user)
    || await canManageOrganizationBilling(user.id, fee.organization_id)
  if (!authorized) return mobileError('Forbidden', 403)
  const { data: invoices } = await supabaseAdmin.from('organization_recurring_fee_invoices')
    .select('id,amount_due_cents,amount_paid_cents,refunded_amount_cents,currency,status,paid_at,created_at,updated_at')
    .eq('recurring_fee_id', fee.id).order('created_at', { ascending: false }).limit(24)
  const [{data:organization},{data:athlete},{data:offer},{data:credits}]=await Promise.all([
    supabaseAdmin.from('organizations').select('id,name').eq('id',fee.organization_id).maybeSingle(),
    supabaseAdmin.from('athlete_profiles').select('id,first_name,last_name').eq('id',fee.athlete_id).maybeSingle(),
    fee.offer_id?supabaseAdmin.from('organization_recurring_fee_offers').select('id,cancellation_terms,refund_terms,end_date,payment_count,benefits').eq('id',fee.offer_id).maybeSingle():Promise.resolve({data:null}),
    supabaseAdmin.from('organization_recurring_fee_credit_grants').select('id,invoice_id,group_credits,one_on_one_credits,granted_at').eq('recurring_fee_id',fee.id).order('granted_at',{ascending:false}).limit(24),
  ])
  const breakdown=calculateOrganizationPayment(Number(fee.amount_cents))
  return NextResponse.json({ fee:{...fee,organization,athlete,base_amount_cents:breakdown.base_amount_cents,service_fee_cents:breakdown.service_fee_cents,total_cents:breakdown.total_cents,frequency:fee.interval,first_charge_date:fee.start_date,end_date:offer?.end_date||null,payment_count:offer?.payment_count||null,cancellation_terms:offer?.cancellation_terms||null,refund_terms:offer?.refund_terms||null,benefits:offer?.benefits||{},manage_billing:['active','trialing','past_due','paused'].includes(String(fee.status))}, invoices: invoices || [],credit_grants:credits||[] })
}
