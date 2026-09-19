import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { canManageOrganizationBilling, isSuperadminUser } from '@/lib/recurringFees'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401)
  const feeId = new URL(request.url).searchParams.get('fee_id')?.trim()
  if (!feeId) return mobileError('fee_id is required', 422)
  const { data: fee, error } = await supabaseAdmin.from('organization_recurring_fees')
    .select('id,organization_id,athlete_id,payer_user_id,amount_cents,currency,interval,description,start_date,status,payment_method_status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,paused_at,created_at,updated_at')
    .eq('id', feeId).maybeSingle()
  if (error) return mobileError('Unable to load recurring fee status', 500)
  if (!fee) return mobileError('Recurring fee not found', 404)
  const authorized = fee.payer_user_id === user.id || await isSuperadminUser(user)
    || await canManageOrganizationBilling(user.id, fee.organization_id)
  if (!authorized) return mobileError('Forbidden', 403)
  const { data: invoices } = await supabaseAdmin.from('organization_recurring_fee_invoices')
    .select('id,amount_due_cents,amount_paid_cents,refunded_amount_cents,currency,status,paid_at,created_at,updated_at')
    .eq('recurring_fee_id', fee.id).order('created_at', { ascending: false }).limit(24)
  return NextResponse.json({ fee, invoices: invoices || [] })
}
