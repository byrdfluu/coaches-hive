import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete','admin']); if (error || !session) return error
  const [{ data: transactions }, { data: installments }, { data: methods }] = await Promise.all([
    supabaseAdmin.from('payment_transactions').select('*').or(`payer_id.eq.${session.user.id},player_id.eq.${session.user.id}`).order('occurred_at',{ascending:false}),
    supabaseAdmin.from('org_dues_installments').select('*').or(`family_account_id.eq.${session.user.id},player_id.eq.${session.user.id}`).order('due_at'),
    supabaseAdmin.from('athlete_payment_methods').select('card_brand,card_last4,card_exp_month,card_exp_year,autopay_enabled,autopay_day').eq('athlete_id',session.user.id),
  ])
  return NextResponse.json({ outstanding: (installments||[]).filter(r=>!['paid','waived'].includes(r.status)).map(r=>({...r,balance_cents:Math.max(0,Number(r.amount_due_cents)-Number(r.amount_paid_cents||0))})), transactions:transactions||[], autopay_enrollments:(installments||[]).filter(r=>r.autopay), payment_methods:methods||[] })
}
