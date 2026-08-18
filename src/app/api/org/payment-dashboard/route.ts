import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','coach','admin']
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"','""')}"`
export async function GET(request: Request) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const { data: membership } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', session.user.id).maybeSingle()
  if (!membership?.org_id) return jsonError('Organization not found', 404)
  const url = new URL(request.url); let query = supabaseAdmin.from('payment_transactions').select('*').eq('org_id', membership.org_id).order('occurred_at', { ascending: false }).limit(5000)
  const type = url.searchParams.get('type'), team = url.searchParams.get('team_id'), from = url.searchParams.get('from'), to = url.searchParams.get('to')
  if (type) query = query.eq('transaction_type', type); if (team) query = query.eq('team_id', team); if (from) query = query.gte('occurred_at', from); if (to) query = query.lte('occurred_at', to)
  const { data: transactions, error: dbError } = await query; if (dbError) return jsonError(dbError.message, 500)
  if (url.searchParams.get('format') === 'csv') {
    const lines = [['date','type','description','status','amount_cents','platform_fee_cents','stripe_processing_fee_cents','net_cents','payment_intent_id'], ...(transactions || []).map((r) => [r.occurred_at,r.transaction_type,r.description,r.status,r.amount_cents,r.platform_fee_cents,r.stripe_processing_fee_cents,r.net_cents,r.stripe_payment_intent_id])]
    return new NextResponse(lines.map((line) => line.map(csv).join(',')).join('\n'), { headers: { 'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="payment-transactions.csv"' } })
  }
  const now = Date.now(), week = now - 7*86_400_000, month = new Date(); month.setUTCDate(1); month.setUTCHours(0,0,0,0)
  const succeeded = (transactions || []).filter((r) => r.status === 'succeeded')
  const byCategory = succeeded.reduce<Record<string,number>>((acc,r) => { acc[r.transaction_type]=(acc[r.transaction_type]||0)+Number(r.amount_cents||0); return acc }, {})
  const { data: installments } = await supabaseAdmin.from('org_dues_installments').select('amount_due_cents,amount_paid_cents,due_at,status,org_dues_schedules!inner(org_id)').eq('org_dues_schedules.org_id', membership.org_id)
  const owed = (installments || []).reduce((n,r)=>n+Number(r.amount_due_cents||0),0), collected=(installments||[]).reduce((n,r)=>n+Number(r.amount_paid_cents||0),0)
  const aging = { days_0_30:0, days_31_60:0, days_60_plus:0 }; for (const row of installments || []) { const balance=Math.max(0,Number(row.amount_due_cents)-Number(row.amount_paid_cents||0)); const age=Math.floor((now-new Date(row.due_at).getTime())/86_400_000); if(age<0)continue; if(age<=30)aging.days_0_30+=balance; else if(age<=60)aging.days_31_60+=balance; else aging.days_60_plus+=balance }
  return NextResponse.json({ summary: { all_time_cents:succeeded.reduce((n,r)=>n+Number(r.amount_cents||0),0), this_month_cents:succeeded.filter(r=>new Date(r.occurred_at)>=month).reduce((n,r)=>n+Number(r.amount_cents||0),0), this_week_cents:succeeded.filter(r=>new Date(r.occurred_at).getTime()>=week).reduce((n,r)=>n+Number(r.amount_cents||0),0), revenue_by_category_cents:byCategory, collection_rate:owed?collected/owed:0, outstanding_aging_cents:aging }, transactions: transactions || [] })
}
