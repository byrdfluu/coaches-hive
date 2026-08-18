import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','admin']
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const { id } = await params; const body = await request.json().catch(() => ({})); const status = String(body.status || '')
  if (!['waived','paid_off_platform'].includes(status)) return jsonError('status must be waived or paid_off_platform')
  const { data: installment } = await supabaseAdmin.from('org_dues_installments').select('*,org_dues_schedules(org_id,title,team_id)').eq('id', id).maybeSingle()
  const schedule = Array.isArray(installment?.org_dues_schedules) ? installment.org_dues_schedules[0] : installment?.org_dues_schedules
  if (!installment || !schedule) return jsonError('Installment not found',404)
  const { data: membership } = await supabaseAdmin.from('organization_memberships').select('id').eq('org_id',schedule.org_id).eq('user_id',session.user.id).maybeSingle()
  if (!membership) return jsonError('Forbidden',403)
  const amount = status === 'paid_off_platform' ? Number(installment.amount_due_cents) : 0
  await supabaseAdmin.from('org_dues_installments').update({ status, amount_paid_cents: amount, updated_at:new Date().toISOString() }).eq('id',id)
  await supabaseAdmin.from('payment_transactions').insert({
    transaction_type:'dues',status,org_id:schedule.org_id,player_id:installment.player_id,team_id:schedule.team_id,
    source_record_type:'org_dues_installment',source_record_id:id,description:schedule.title,
    amount_cents:amount,gross_amount_cents:amount,platform_fee_cents:0,net_cents:amount,net_amount_cents:amount,currency:'usd',
    metadata:{ recorded_by:session.user.id, off_platform:status==='paid_off_platform', reason:body.reason||null },
  })
  return NextResponse.json({ id,status,amount_paid_cents:amount })
}
