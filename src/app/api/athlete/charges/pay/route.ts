import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPaymentReceiptEmail } from '@/lib/email'
import { checkGuardianApproval, guardianApprovalBlockedResponse } from '@/lib/guardianApproval'
import { trackMixpanelServerEvent } from '@/lib/mixpanelServer'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { assignment_id, payment_intent_id } = body || {}
  if (!assignment_id) {
    return jsonError('assignment_id is required')
  }

  const { data: assignment, error: lookupError } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status')
    .eq('id', assignment_id)
    .maybeSingle()

  if (lookupError || !assignment) {
    return jsonError('Assignment not found', 404)
  }

  if (role === 'athlete' && assignment.athlete_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  const { data: feeRow } = await supabaseAdmin
    .from('org_fees')
    .select('org_id, amount_cents, title')
    .eq('id', assignment.fee_id)
    .maybeSingle()

  if (!feeRow) {
    return jsonError('Fee not found', 404)
  }

  if (role === 'athlete') {
    const guardianCheck = await checkGuardianApproval({
      athleteId: assignment.athlete_id,
      targetType: 'org',
      targetId: String(feeRow.org_id),
      scope: 'transactions',
    })
    if (!guardianCheck.allowed) {
      return guardianApprovalBlockedResponse({
        scope: 'transactions',
        targetType: 'org',
        targetId: String(feeRow.org_id),
        pending: guardianCheck.pending,
        approvalId: guardianCheck.approvalId,
      })
    }
  }

  const updatePayload: Record<string, string> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
  }
  if (payment_intent_id) updatePayload.payment_intent_id = String(payment_intent_id)

  const { data, error: updateError } = await supabaseAdmin
    .from('org_fee_assignments')
    .update(updatePayload)
    .eq('id', assignment_id)
    .select('*')
    .single()

  if (updateError) {
    return jsonError(updateError.message)
  }

  if (feeRow?.org_id) {
    const amount = Number(feeRow.amount_cents || 0) / 100
    const { data: receiptRow } = await supabaseAdmin.from('payment_receipts').insert({
      payer_id: data.athlete_id,
      org_id: feeRow.org_id,
      fee_assignment_id: data.id,
      amount,
      currency: 'usd',
      status: 'paid',
      stripe_payment_intent_id: data.payment_intent_id || null,
      metadata: {
        source: 'org_fee',
        fee_title: feeRow.title || null,
      },
    }).select('id').maybeSingle()

    const { data: athleteProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', data.athlete_id)
      .maybeSingle()

    if (athleteProfile?.email) {
      await sendPaymentReceiptEmail({
        toEmail: athleteProfile.email,
        toName: athleteProfile.full_name,
        amount,
        currency: 'usd',
        receiptId: receiptRow?.id || null,
        description: feeRow.title || 'Organization fee',
        dashboardUrl: '/athlete/payments',
      })
    }

    await trackMixpanelServerEvent({
      event: 'Org Revenue Recorded',
      distinctId: `org:${feeRow.org_id}`,
      properties: {
        org_id: feeRow.org_id,
        athlete_id: data.athlete_id,
        fee_assignment_id: data.id,
        fee_title: feeRow.title || null,
        gross_revenue: amount,
        org_revenue: amount,
        platform_revenue: 0,
        platform_net_profit_estimate: 0,
        currency: 'usd',
        status: 'paid',
      },
    })
  }

  return NextResponse.json({ assignment: data })
}
