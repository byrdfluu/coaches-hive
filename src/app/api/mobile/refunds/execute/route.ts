import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createAuthenticatedRequestClient } from '@/lib/requestSupabase'
import { enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { mobileContractError } from '@/lib/mobileApiContract'
import { parseUuid } from '@/lib/uuid'
import { insertNotifications } from '@/lib/inAppNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const fail=(code:string,message:string,status:number)=>mobileContractError(code,message,status,status===429||status>=500)

async function loadContext(request:Request){
  const user=await getMobileRequestUser(request);if(!user)return{error:fail('unauthorized','Authentication is required.',401)}
  const {data:profile}=await supabaseAdmin.from('profiles').select('role').eq('id',user.id).maybeSingle()
  return{user,isPrivateSuperadmin:profile?.role==='superadmin'}
}

export async function GET(request:Request){
  const auth=await loadContext(request);if('error'in auth)return auth.error
  const requestId=parseUuid(new URL(request.url).searchParams.get('request_id'))
  let query=(supabaseAdmin as any).from('payment_refund_requests').select('*').order('requested_at',{ascending:false}).limit(200)
  if(requestId)query=query.eq('id',requestId)
  else if(!auth.isPrivateSuperadmin){
    const workspaceId=request.headers.get('x-workspace-id')
    const {data:workspace}=workspaceId?await supabaseAdmin.from('business_workspaces').select('organization_id').eq('id',workspaceId).maybeSingle():{data:null}
    if(!workspace?.organization_id)return fail('refund_permission_denied','Select an organization workspace.',403)
    const {data:membership}=await supabaseAdmin.from('organization_memberships').select('role,status').eq('org_id',workspace.organization_id).eq('user_id',auth.user.id).eq('status','active').maybeSingle()
    if(!['org_admin','program_director'].includes(String(membership?.role)))return fail('refund_permission_denied','Organization admin or program director access is required.',403)
    query=query.eq('org_id',workspace.organization_id)
  }
  const {data:rows,error}=await query;if(error)return fail('refunds_unavailable','Refund requests are temporarily unavailable.',503)
  const ids=(rows||[]).map((row:any)=>row.id),{data:adjustments}=ids.length?await(supabaseAdmin as any).from('refund_fulfillment_adjustments').select('*').in('refund_request_id',ids):{data:[]}
  return NextResponse.json({refund_requests:(rows||[]).map((row:any)=>({...row,status:row.status==='refunded'&&Number(row.refunded_amount_cents||0)<Number(row.approved_amount_cents||row.requested_amount_cents||0)?'partially_refunded':row.status,fulfillment_adjustments:(adjustments||[]).filter((item:any)=>item.refund_request_id===row.id)}))})
}

export async function POST(request:Request){
  const auth=await loadContext(request);if('error'in auth)return auth.error
  const body=await request.json().catch(()=>({})),requestId=parseUuid(body.request_id),action=String(body.action||''),note=String(body.resolution_note||'').trim()
  const key=parseUuid(request.headers.get('idempotency-key'))||parseUuid(body.idempotency_key)
  if(!requestId||!key)return fail('invalid_request','A refund request and stable UUID idempotency key are required.',422)
  if(!['under_review','reject','money_refund'].includes(action))return fail('invalid_action','Choose under review, reject, or money refund.',422)
  if(note.length<3)return fail('resolution_note_required','A resolution note is required.',422)
  if(!(await enforcePaymentRateLimit(auth.user.id,'mobile_refund_execute',10,300).catch(()=>false)))return fail('rate_limited','Too many refund attempts. Try again shortly.',429)
  const {data:row}=await(supabaseAdmin as any).from('payment_refund_requests').select('*').eq('id',requestId).maybeSingle()
  if(!row)return fail('refund_not_found','Refund request not found.',404)
  const {data:membership}=row.org_id?await supabaseAdmin.from('organization_memberships').select('role,status').eq('org_id',row.org_id).eq('user_id',auth.user.id).eq('status','active').maybeSingle():{data:null}
  const orgAllowed=['org_admin','program_director'].includes(String(membership?.role))
  const override=body.superadmin_override===true
  if(override&&!auth.isPrivateSuperadmin)return fail('superadmin_override_required','Private superadmin authorization is required.',403)
  if(!override&&!orgAllowed)return fail('refund_permission_denied','Organization admin or program director access is required.',403)
  const overrideReason=String(body.override_reason||'').trim()
  if(override&&overrideReason.length<10)return fail('override_reason_required','A detailed override reason of at least 10 characters is required.',422)
  if(action!=='money_refund'){
    const status=action==='reject'?'rejected':'under_review'
    const {error}=await(supabaseAdmin as any).from('payment_refund_requests').update({status,resolution_note:note,decision_by:auth.user.id,
      decision_role:override?'superadmin':String(membership?.role),decision_at:new Date().toISOString(),override_reason:override?overrideReason:null,updated_at:new Date().toISOString()}).eq('id',requestId).eq('org_id',row.org_id)
    if(error)return fail('refund_update_failed','The refund request could not be updated.',503)
    if(status==='rejected')await insertNotifications({user_id:row.requester_id,type:'refund_rejected',title:'Refund request rejected',body:'Your refund request was reviewed and rejected.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-rejected:${requestId}`,data:{refund_request_id:requestId}})
    return NextResponse.json({status})
  }
  const requested=Number(row.requested_amount_cents||0),approved=Number(body.approved_amount_cents||requested)
  if(!Number.isSafeInteger(approved)||approved<1||approved>requested)return fail('refund_amount_invalid','The approved amount cannot exceed the requested amount.',409)
  try{
    const client=await createAuthenticatedRequestClient(request)
    const {data:approvedRow,error:approvalError}=await(client as any).rpc('approve_offering_refund',{p_request_id:requestId,p_approved_amount_cents:approved,
      p_resolution_note:note,p_idempotency_key:key,p_superadmin_override:override,p_override_reason:override?overrideReason:null})
    if(approvalError)throw approvalError
    let txQuery=supabaseAdmin.from('payment_transactions').select('stripe_payment_intent_id').order('occurred_at',{ascending:false}).limit(1)
    txQuery=approvedRow.payment_transaction_id?txQuery.eq('id',approvedRow.payment_transaction_id):txQuery.eq('source_record_id',approvedRow.payment_record_id)
    const {data:tx}=await txQuery.maybeSingle();if(!tx?.stripe_payment_intent_id)throw new Error('Original payment is unavailable')
    const refund=await stripe.refunds.create({payment_intent:tx.stripe_payment_intent_id,amount:Number(approvedRow.approved_amount_cents),reverse_transfer:true,refund_application_fee:true,metadata:{refund_request_id:requestId}}, {idempotencyKey:`offering-refund-${requestId}`})
    const {data:applied,error:applyError}=await(supabaseAdmin as any).rpc('apply_offering_refund_result',{p_request_id:requestId,p_stripe_refund_id:refund.id,p_refunded_amount_cents:Number(refund.amount),p_stripe_status:String(refund.status||'pending'),p_receipt_url:null})
    if(applyError)throw applyError
    await insertNotifications({user_id:row.requester_id,type:'refund_processing',title:'Refund processing',body:'Stripe is processing your approved refund.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-processing:${requestId}`,data:{refund_request_id:requestId,stripe_refund_id:refund.id}})
    return NextResponse.json({status:applied?.status||'processing',stripe_refund_id:refund.id,restored_group_credits:Number(applied?.restored_group_credits||0),restored_one_on_one_credits:Number(applied?.restored_one_on_one_credits||0)})
  }catch(error){safePaymentError('[mobile/refunds/execute] failed',error,{request_id:requestId,user_id:auth.user.id});await insertNotifications([{user_id:row.requester_id,type:'refund_failed',title:'Refund failed',body:'Your refund could not be completed. The organization has been notified.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-failed:${requestId}:requester`,data:{refund_request_id:requestId}},{user_id:auth.user.id,type:'refund_failed',title:'Refund processing failed',body:'A refund submitted for your organization needs attention.',action_url:'/org/refunds',category:'Payments',deduplication_key:`refund-failed:${requestId}:reviewer`,data:{refund_request_id:requestId}}]);return fail('refund_processing_failed','The refund could not be submitted to Stripe.',503)}
}
