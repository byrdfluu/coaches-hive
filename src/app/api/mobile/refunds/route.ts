import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { idempotencyKeyFor } from '@/lib/requestSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'
import { mobileContractError } from '@/lib/mobileApiContract'

export const dynamic = 'force-dynamic'
const activeStatuses = ['requested','under_review','approved','processing','refund_processing','credits_restored','partially_refunded','refund_and_credits_completed']
const fail = (code:string,message:string,status:number) => mobileContractError(code,message,status,status===429||status>=500)
const paymentType = (source: string, metadata: Record<string,unknown>) => {
  if (source.includes('training') && metadata.stripe_invoice_id) return 'recurring_renewal'
  if (source.includes('training')) return 'training_package'
  if (source.includes('tryout')) return 'tryout'
  if (source.includes('program')) return 'program'
  if (source.includes('session') || source.includes('booking')) return 'training_session'
  if (source.includes('marketplace')) return 'marketplace_order'
  if (source.includes('fee')) return 'org_fee'
  return null
}

export async function GET(request:Request){
  const user=await getMobileRequestUser(request)
  if(!user)return fail('unauthorized','Authentication is required.',401)
  const athleteId=parseUuid(new URL(request.url).searchParams.get('athlete_profile_id'))
  if(!athleteId)return fail('invalid_athlete_profile_id','A valid athlete_profile_id is required.',422)
  if(!(await userOwnsAthleteProfile(supabaseAdmin,user.id,athleteId)))return fail('athlete_forbidden','This athlete profile is unavailable.',403)
  const {data:rows,error}=await supabaseAdmin.from('payment_transactions').select('*')
    .eq('athlete_profile_id',athleteId).eq('payer_id',user.id).order('occurred_at',{ascending:false})
  if(error)return fail('refunds_unavailable','Refund information is temporarily unavailable.',503)
  const ids=Array.from(new Set((rows||[]).flatMap(row=>[row.id,row.source_record_id]).filter(Boolean)))
  const {data:requests}=ids.length?await supabaseAdmin.from('payment_refund_requests').select('*')
    .eq('requester_id',user.id).in('payment_record_id',ids):{data:[] as any[]}
  const requestMap=new Map((requests||[]).filter(row=>activeStatuses.includes(row.status)).map(row=>[row.payment_record_id,row]))
  return NextResponse.json({payments:(rows||[]).flatMap(row=>{
    const type=paymentType(String(row.source_record_type||''),row.metadata||{})
    if(!type)return []
    const existing=requestMap.get(row.id)||requestMap.get(row.source_record_id),paid=Number(row.gross_amount_cents||row.amount_cents||0),refunded=Number(row.refunded_amount_cents||0)
    const maximum=Math.max(0,Number(row.base_amount_cents||paid)-refunded),succeeded=row.status==='succeeded',refundable=succeeded&&maximum>0&&!existing
    return [{payment_type:type,payment_record_id:row.source_record_id||row.id,
      transaction_id:row.id,athlete_profile_id:row.athlete_profile_id,organization_id:row.org_id,offering_name:row.description,
      amount_paid_cents:paid,amount_already_refunded_cents:refunded,maximum_refundable_amount_cents:maximum,currency:row.currency,
      payment_date:row.occurred_at,refund_status:existing?.status||null,refundable,
      not_refundable_reason:refundable?null:existing?'A refund request already exists for this payment.':!succeeded?'Only completed payments are refundable.':'No refundable balance remains.'}
  ]})})
}

export async function POST(request:Request){
  const user=await getMobileRequestUser(request)
  if(!user)return fail('unauthorized','Authentication is required.',401)
  const body=await request.json().catch(()=>({})),transactionId=parseUuid(body.transaction_id),reason=String(body.reason||'').trim()
  const amount=Number(body.amount_cents||0),resolved=idempotencyKeyFor(request,body)
  if('error' in resolved)return fail('idempotency_key_required','A valid Idempotency-Key is required.',422)
  if(!transactionId||reason.length<10||!Number.isSafeInteger(amount)||amount<=0)return fail('invalid_request','Transaction, refundable amount, and a reason of at least 10 characters are required.',422)
  const {data:tx}=await supabaseAdmin.from('payment_transactions').select('*').eq('id',transactionId).maybeSingle()
  if(!tx||tx.payer_id!==user.id||!tx.athlete_profile_id||!(await userOwnsAthleteProfile(supabaseAdmin,user.id,tx.athlete_profile_id)))return fail('payment_unavailable','This payment is unavailable.',404)
  const maximum=Math.max(0,Number(tx.base_amount_cents||tx.gross_amount_cents||0)-Number(tx.refunded_amount_cents||0))
  if(tx.status!=='succeeded'||amount>maximum)return fail('refund_amount_invalid','The requested amount exceeds the refundable balance.',409)
  const type=paymentType(String(tx.source_record_type||''),tx.metadata||{})
  if(!type)return fail('refund_type_unsupported','This payment is not eligible for an in-app refund request.',409)
  const legacyRecordTypes=['org_fee','coach_fee','league_fee']
  const refundRecordId=legacyRecordTypes.includes(type)&&tx.source_record_id?tx.source_record_id:tx.id
  const {data:existing}=await supabaseAdmin.from('payment_refund_requests').select('*').eq('requester_id',user.id)
    .eq('payment_type',type).eq('payment_record_id',refundRecordId).in('status',activeStatuses).maybeSingle()
  if(existing)return NextResponse.json({refund_request:existing,reused:true})
  const {data:created,error}=await supabaseAdmin.from('payment_refund_requests').insert({requester_id:user.id,athlete_id:tx.athlete_profile_id,
    payment_type:type,payment_record_id:refundRecordId,amount:amount/100,requested_amount_cents:amount,reason,status:'requested',org_id:tx.org_id,
    idempotency_key:resolved.key}).select('*').single()
  if(error)return error.code==='23505'?fail('refund_request_exists','A refund request already exists for this payment.',409):fail('refund_request_failed','We could not submit the refund request.',503)
  return NextResponse.json({refund_request:created},{status:201})
}
