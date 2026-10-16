import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { idempotencyKeyFor } from '@/lib/requestSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'
import { mobileContractError } from '@/lib/mobileApiContract'
import { createAuthenticatedRequestClient } from '@/lib/requestSupabase'

export const dynamic = 'force-dynamic'
const activeStatuses = ['requested','under_review','approved','processing','refund_processing','credits_restored','partially_refunded','refund_and_credits_completed']
const fail = (code:string,message:string,status:number) => mobileContractError(code,message,status,status===429||status>=500)
const paymentType = (source: string, metadata: Record<string,unknown>) => {
  if (source === 'org_training_multi_checkout') return 'training_session'
  if (source.includes('training') && metadata.stripe_invoice_id) return 'recurring_renewal'
  if (source.includes('training')) return 'training_package'
  if (source.includes('program')) return 'program_registration'
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
  const organizationIds=Array.from(new Set((rows||[]).map(row=>row.org_id).filter(Boolean))) as string[]
  const paymentIntentIds=Array.from(new Set((rows||[]).map(row=>row.stripe_payment_intent_id).filter(Boolean))) as string[]
  const requestClient=await createAuthenticatedRequestClient(request)
  const [{data:requests},{data:organizations},{data:receipts},{data:subscriptions}]=await Promise.all([
    (supabaseAdmin as any).from('payment_refund_requests').select('*').eq('requester_id',user.id).eq('athlete_id',athleteId).order('requested_at',{ascending:false}),
    organizationIds.length?supabaseAdmin.from('organizations').select('id,name').in('id',organizationIds):Promise.resolve({data:[] as any[]}),
    paymentIntentIds.length?supabaseAdmin.from('payment_receipts').select('stripe_payment_intent_id,receipt_url').in('stripe_payment_intent_id',paymentIntentIds):Promise.resolve({data:[] as any[]}),
    (requestClient as any).rpc('my_offering_subscription_status',{p_athlete_id:athleteId}),
  ])
  const refundReceiptIds=(requests||[]).map((row:any)=>row.receipt_id).filter(Boolean)
  const {data:refundReceipts}=refundReceiptIds.length?await(supabaseAdmin as any).from('payment_receipts').select('id,metadata').in('id',refundReceiptIds):{data:[]}
  const requestMap=new Map<string,any>()
  for(const refund of requests||[]){
    if(refund.status==='refunded'&&Number(refund.refunded_amount_cents||0)<Number(refund.approved_amount_cents||refund.requested_amount_cents||0))refund.status='partially_refunded'
    if(!activeStatuses.includes(refund.status)&&!['rejected','refunded','refund_and_credits_completed'].includes(refund.status))continue
    if(refund.payment_transaction_id)requestMap.set(refund.payment_transaction_id,refund)
    if(refund.payment_record_id)requestMap.set(refund.payment_record_id,refund)
  }
  const organizationMap=new Map((organizations||[]).map(row=>[row.id,row.name]))
  const receiptMap=new Map((receipts||[]).map(row=>[row.stripe_payment_intent_id,row.receipt_url]))
  return NextResponse.json({payments:(rows||[]).flatMap(row=>{
    const type=paymentType(String(row.source_record_type||''),row.metadata||{})
    if(!type)return []
    const existing=requestMap.get(row.id)||requestMap.get(row.source_record_id),paid=Number(row.gross_amount_cents||row.amount_cents||0),refunded=Number(row.refunded_amount_cents||0)
    const maximum=Math.max(0,Number(row.base_amount_cents||paid)-refunded),succeeded=row.status==='succeeded',refundable=succeeded&&maximum>0&&!existing
    return [{payment_type:type,payment_record_id:row.source_record_id||row.id,
      transaction_id:row.id,athlete_profile_id:row.athlete_profile_id,organization_id:row.org_id,offering_name:row.description,
      organization_name:row.org_id?organizationMap.get(row.org_id)||null:null,
      amount_paid_cents:paid,base_amount_cents:Number(row.base_amount_cents||paid),nonrefundable_fee_cents:Number(row.service_fee_cents||0),amount_already_refunded_cents:refunded,maximum_refundable_amount_cents:maximum,currency:row.currency,
      payment_date:row.occurred_at,refund_status:existing?.status||null,requested_amount_cents:Number(existing?.requested_amount_cents||0),
      refunded_amount_cents:refunded,restored_group_credits:Number(existing?.restored_group_credits||0),
      restored_one_on_one_credits:Number(existing?.restored_one_on_one_credits||0),resolution_note:existing?.resolution_note||null,
      requested_at:existing?.requested_at||null,resolved_at:existing?.resolved_at||null,
      receipt_url:row.stripe_payment_intent_id?receiptMap.get(row.stripe_payment_intent_id)||null:null,
      refund_receipt_url:existing?.receipt_id?String((refundReceipts||[]).find((receipt:any)=>receipt.id===existing.receipt_id)?.metadata?.receipt_url||'')||null:null,refundable,
      occurrences:Array.isArray(row.metadata?.occurrences)?row.metadata.occurrences:[],
      not_refundable_reason:refundable?null:existing?'A refund request already exists for this payment.':!succeeded?'Only completed payments are refundable.':'No refundable balance remains.'}
  ]}),subscriptions:subscriptions||[]})
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
  const maximum=Math.max(0,Number(tx.base_amount_cents??tx.gross_amount_cents??0)-Number(tx.refunded_amount_cents||0))
  if(tx.status!=='succeeded'||amount>maximum)return fail('refund_amount_invalid','The requested amount exceeds the refundable balance.',409)
  const type=paymentType(String(tx.source_record_type||''),tx.metadata||{})
  if(!type)return fail('refund_type_unsupported','This payment is not eligible for an in-app refund request.',409)
  const refundRecordId=tx.source_record_id||tx.id
  let existingQuery=supabaseAdmin.from('payment_refund_requests').select('*').eq('requester_id',user.id).eq('payment_type',type).eq('payment_record_id',refundRecordId).in('status',activeStatuses)
  const {data:existing}=await existingQuery.maybeSingle()
  if(existing)return NextResponse.json({refund_request:existing,reused:true})
  const client=await createAuthenticatedRequestClient(request)
  const {data:created,error}=await(client as any).rpc('request_offering_refund',{p_payment_type:type,p_payment_record_id:refundRecordId,p_requested_amount_cents:amount,p_reason:reason})
  if(error){const raw=String(error.message||'');if(raw.includes('REFUND_REASON_REQUIRED'))return fail('refund_reason_required','A reason of at least 10 characters is required.',422);if(raw.includes('REFUND_AMOUNT_INVALID'))return fail('refund_amount_invalid','The requested amount exceeds the refundable balance.',409);if(raw.includes('REFUND_PAYMENT_NOT_ELIGIBLE'))return fail('refund_payment_not_eligible','Only completed eligible payments can be refunded.',409);if(raw.includes('REFUND_REQUEST_ALREADY_ACTIVE'))return fail('refund_request_exists','A refund request already exists for this payment.',409);return fail('refund_request_failed','We could not submit the refund request.',503)}
  const {data:linked,error:linkError}=await supabaseAdmin.from('payment_refund_requests')
    .update({org_id:tx.org_id,payment_transaction_id:tx.id,payment_record_id:refundRecordId,idempotency_key:resolved.key})
    .eq('id',created.id).eq('requester_id',user.id).select('*').single()
  if(linkError)return fail('refund_request_link_failed','The refund request was created but could not be linked to its payment.',503)
  return NextResponse.json({refund_request:linked},{status:201})
}
