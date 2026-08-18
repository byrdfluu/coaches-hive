import { NextResponse } from 'next/server'
import { mobileError, requireMobileUser, userCanAccessPlayer } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireMobileUser(request);if('response'in auth)return auth.response;const{id}=await params;const body=await request.json().catch(()=>({}))
  const playerId=String(body.player_id||'');if(!playerId||!(await userCanAccessPlayer(auth.user.id,playerId)))return mobileError('You cannot register this player',403)
  const {data:form}=await supabaseAdmin.from('org_enrollment_forms').select('*').eq('id',id).eq('is_active',true).maybeSingle();if(!form)return mobileError('Registration not found',404)
  const requested=Array.isArray(body.signed_waiver_ids)?body.signed_waiver_ids.map(String):[],required=Array.isArray(form.required_waiver_ids)?form.required_waiver_ids.map(String):[]
  const {data:signatures}=required.length?await supabaseAdmin.from('waiver_signatures').select('waiver_id,signed_at').in('waiver_id',required).in('user_id',[auth.user.id,playerId]):{data:[]}
  const signed=Array.from(new Set((signatures||[]).map(row=>String(row.waiver_id)).filter(id=>requested.includes(id))))
  if(required.some((waiver:string)=>!signed.includes(waiver)))return mobileError('All required waivers must be signed and verified',422)
  const now=Date.now(),early=form.early_bird_deadline&&now<=new Date(form.early_bird_deadline).getTime(),late=form.late_fee_starts_at&&now>=new Date(form.late_fee_starts_at).getTime()
  const phase=early?'early_bird':late?'late':'standard';let amount=Number(early?form.early_bird_fee_cents:late?form.late_fee_cents:form.enrollment_fee_cents)||0
  const bundle=body.bundle_key&&form.bundle_config?.[body.bundle_key];if(bundle&&Number(bundle.amount_cents)>=0)amount=Math.round(Number(bundle.amount_cents))
  const source=['direct_link','referral','in_app'].includes(body.registration_source)?body.registration_source:'in_app'
  const {data:profile}=await supabaseAdmin.from('profiles').select('full_name,email').eq('id',playerId).maybeSingle()
  const {data,error}=await supabaseAdmin.from('org_enrollment_submissions').insert({form_id:id,org_id:form.org_id,player_id:playerId,family_account_id:auth.user.id,
    athlete_name:profile?.full_name||String(body.player_name||'Player'),athlete_email:profile?.email||auth.user.email||'',guardian_name:String(body.guardian_name||'')||null,
    guardian_email:auth.user.email||null,notes:String(body.notes||'')||null,status:'pending',payment_status:amount>0?'pending':'paid',amount_paid_cents:0,
    amount_due_cents:amount,pricing_phase:phase,registration_source:source,signed_waiver_ids:signed,waiver_signed_at:signed.length?(signatures||[]).map(row=>row.signed_at).filter(Boolean).sort().at(-1)||new Date().toISOString():null}).select('*').single()
  if(error)return mobileError(error.message,500)
  return NextResponse.json({submission:data,amount_cents:amount,pricing_phase:phase,requires_payment:amount>0},{status:201})
}
