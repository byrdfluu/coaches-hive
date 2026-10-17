import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createAuthenticatedRequestClient } from '@/lib/requestSupabase'
import { enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { mobileContractError, safeMobileMessage } from '@/lib/mobileApiContract'
import { parseUuid } from '@/lib/uuid'
import { insertNotifications } from '@/lib/inAppNotifications'
import { requestIdFor } from '@/lib/requestSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const fail=(code:string,message:string,status:number)=>mobileContractError(code,message,status,status===429||status>=500)

async function loadContext(request:Request){
  const user=await getMobileRequestUser(request);if(!user)return{error:fail('AUTHENTICATION_REQUIRED','A valid mobile access token is required.',401)}
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
    const {data:canManage}=await supabaseAdmin.rpc('can_manage_org_refunds',{p_org_id:workspace.organization_id,p_user_id:auth.user.id})
    if(canManage!==true)return fail('refund_permission_denied','Refund-management access is required for this organization.',403)
    query=query.eq('org_id',workspace.organization_id)
  }
  const {data:rows,error}=await query;if(error)return fail('refunds_unavailable','Refund requests are temporarily unavailable.',503)
  const ids=(rows||[]).map((row:any)=>row.id),{data:adjustments}=ids.length?await(supabaseAdmin as any).from('refund_fulfillment_adjustments').select('*').in('refund_request_id',ids):{data:[]}
  return NextResponse.json({refund_requests:(rows||[]).map((row:any)=>({...row,status:row.status==='refunded'&&Number(row.refunded_amount_cents||0)<Number(row.approved_amount_cents||row.requested_amount_cents||0)?'partially_refunded':row.status,fulfillment_adjustments:(adjustments||[]).filter((item:any)=>item.refund_request_id===row.id)}))})
}

export async function POST(request:Request){
  const correlationId=requestIdFor(request)
  let logUserId:string|null=null,logWorkspaceId:string|null=null,logRefundRequestId:string|null=null
  const fail=(code:string,message:string,status:number)=>{console.error('[mobile/refunds/execute] request failed',{correlation_id:correlationId,
    user_id:logUserId,workspace_id:logWorkspaceId,refund_request_id:logRefundRequestId,error_code:code});return NextResponse.json({success:false,error_code:code,
    request_id:correlationId,correlation_id:correlationId,error:{code,message:safeMobileMessage(message,status),request_id:correlationId}},{status,headers:{'Cache-Control':'no-store','X-Request-ID':correlationId}})}
  const auth=await loadContext(request);if('error'in auth)return fail('AUTHENTICATION_REQUIRED','A valid mobile access token is required.',401)
  logUserId=auth.user.id
  const body=await request.json().catch(()=>({})),requestId=parseUuid(body.request_id),action=String(body.action||''),note=String(body.resolution_note||'').trim()
  const headerKey=parseUuid(request.headers.get('idempotency-key')),bodyKey=parseUuid(body.idempotency_key),workspaceId=parseUuid(request.headers.get('x-workspace-id'))
  logWorkspaceId=workspaceId;logRefundRequestId=requestId
  if(!requestId)return fail('REFUND_REQUEST_NOT_FOUND','A valid refund request is required.',404)
  if(!headerKey||!bodyKey||headerKey!==bodyKey)return fail('INVALID_IDEMPOTENCY_KEY','The Idempotency-Key header must match the request body.',422)
  const key=bodyKey
  if(!workspaceId)return fail('WORKSPACE_MISMATCH','Select the organization workspace connected to this refund.',403)
  if(!['under_review','reject','money_refund'].includes(action))return fail('INVALID_ACTION','Choose under review, reject, or money refund.',422)
  if(note.length<3)return fail('RESOLUTION_NOTE_REQUIRED','A resolution note is required.',422)
  if(!(await enforcePaymentRateLimit(auth.user.id,'mobile_refund_execute',10,300).catch(()=>false)))return fail('RATE_LIMITED','Too many refund attempts. Try again shortly.',429)
  const {data:row}=await(supabaseAdmin as any).from('payment_refund_requests').select('*').eq('id',requestId).maybeSingle()
  if(!row)return fail('REFUND_REQUEST_NOT_FOUND','Refund request not found.',404)
  const {data:workspace}=await supabaseAdmin.from('business_workspaces').select('organization_id').eq('id',workspaceId).maybeSingle()
  if(!row.org_id||workspace?.organization_id!==row.org_id)return fail('WORKSPACE_MISMATCH','The active workspace does not own this refund request.',403)
  const {data:membership}=await supabaseAdmin.from('organization_memberships').select('role,status').eq('org_id',row.org_id).eq('user_id',auth.user.id).eq('status','active').maybeSingle()
  const {data:hasPaymentPermission}=await supabaseAdmin.rpc('can_manage_org_refunds',{p_org_id:row.org_id,p_user_id:auth.user.id})
  const orgAllowed=hasPaymentPermission===true
  const override=body.superadmin_override===true
  if(override&&!auth.isPrivateSuperadmin)return fail('REFUND_FORBIDDEN','Private superadmin authorization is required.',403)
  if(!override&&!orgAllowed)return fail('REFUND_FORBIDDEN','Payment-management permission is required for this organization.',403)
  const overrideReason=String(body.override_reason||'').trim()
  if(override&&overrideReason.length<10)return fail('OVERRIDE_REASON_REQUIRED','A detailed override reason of at least 10 characters is required.',422)
  if(action!=='money_refund'){
    const status=action==='reject'?'rejected':'under_review'
    const client=await createAuthenticatedRequestClient(request)
    const {data:resolved,error}=await(client as any).rpc('resolve_payment_refund_request',{request_id:requestId,new_status:status,resolution_note:note})
    if(error){const raw=String(error.message||'');if(raw.includes('REFUND_RESOLUTION_FORBIDDEN'))return fail('REFUND_FORBIDDEN','Payment-management permission is required for this organization.',403);if(raw.includes('REFUND_ALREADY_FINAL'))return fail('REFUND_ALREADY_PROCESSED','This refund request is already final.',409);return fail('REFUND_UPDATE_FAILED','The refund request could not be updated.',503)}
    if(status==='rejected')await insertNotifications({user_id:row.requester_id,type:'refund_rejected',title:'Refund request rejected',body:'Your refund request was reviewed and rejected.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-rejected:${requestId}`,data:{refund_request_id:requestId}})
    return NextResponse.json({success:true,refund_request_id:requestId,status:resolved?.status||status,idempotency_key:key,
      request_id:correlationId,correlation_id:correlationId},{headers:{'Cache-Control':'no-store','X-Request-ID':correlationId}})
  }
  const approvedKey=parseUuid(row.idempotency_key)
  if(approvedKey&&approvedKey!==key)return fail('IDEMPOTENCY_KEY_CONFLICT','This refund was approved with a different idempotency key.',409)
  if(row.stripe_refund_id&&['refunded','processing','refund_processing'].includes(String(row.status)))return NextResponse.json({success:true,
    refund_request_id:requestId,stripe_refund_id:row.stripe_refund_id,amount_cents:Number(row.refunded_amount_cents||row.approved_amount_cents||0),
    status:row.status==='refunded'?'refunded':'refund_processing',idempotency_key:approvedKey||key,request_id:correlationId,correlation_id:correlationId},
    {headers:{'Cache-Control':'no-store','X-Request-ID':correlationId,'X-Idempotent-Replay':'true'}})
  if(row.stripe_refund_id)return fail('REFUND_ALREADY_PROCESSED','This refund request already has a Stripe refund.',409)
  const requested=Number(row.requested_amount_cents||0),approved=Number(body.approved_amount_cents),storedApproved=Number(row.approved_amount_cents||0)
  if(!Number.isSafeInteger(approved)||approved<1)return fail('REFUND_AMOUNT_INVALID','The approved refund amount must be positive.',422)
  if(row.status!=='approved'||!Number.isSafeInteger(storedApproved)||storedApproved<1||approved!==storedApproved||approved>requested)return fail('AMOUNT_NOT_REFUNDABLE','The approved amount does not match this approved refund request.',422)
  let txQuery=supabaseAdmin.from('payment_transactions').select('id,org_id,stripe_payment_intent_id,stripe_charge_id,gross_amount_cents,amount_cents,refunded_amount_cents').order('occurred_at',{ascending:false}).limit(1)
  txQuery=row.payment_transaction_id?txQuery.eq('id',row.payment_transaction_id):txQuery.eq('source_record_id',row.payment_record_id)
  const {data:tx}=await txQuery.maybeSingle()
  if(!tx||tx.org_id!==row.org_id||(!tx.stripe_payment_intent_id&&!tx.stripe_charge_id))return fail('ORIGINAL_CHARGE_NOT_FOUND','The original Stripe payment could not be located.',404)
  const remaining=Math.max(0,Number(tx.gross_amount_cents||tx.amount_cents||0)-Number(tx.refunded_amount_cents||0))
  if(approved>remaining)return fail('AMOUNT_NOT_REFUNDABLE','The approved amount exceeds the remaining refundable amount.',422)
  const {data:connect}=await supabaseAdmin.from('stripe_connect_accounts').select('stripe_account_id,charges_enabled,connect_status').eq('owner_type','org').eq('owner_id',row.org_id).maybeSingle()
  if(!connect?.stripe_account_id||connect.charges_enabled!==true||connect.connect_status!=='enabled')return fail('STRIPE_ACCOUNT_NOT_READY','The organization Stripe account is not ready to process refunds.',422)
  try{
    const refund=await stripe.refunds.create({...(tx.stripe_payment_intent_id?{payment_intent:tx.stripe_payment_intent_id}:{charge:tx.stripe_charge_id!}),amount:approved,reverse_transfer:true,refund_application_fee:true,metadata:{refund_request_id:requestId,organization_id:row.org_id}}, {idempotencyKey:key})
    const {data:applied,error:applyError}=await(supabaseAdmin as any).rpc('apply_offering_refund_result',{p_request_id:requestId,p_stripe_refund_id:refund.id,p_refunded_amount_cents:Number(refund.amount),p_stripe_status:String(refund.status||'pending'),p_receipt_url:null})
    if(applyError)throw applyError
    await insertNotifications({user_id:row.requester_id,type:'refund_processing',title:'Refund processing',body:'Stripe is processing your approved refund.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-processing:${requestId}`,data:{refund_request_id:requestId,stripe_refund_id:refund.id}})
    const finalStatus=String(applied?.status||refund.status)==='succeeded' || String(applied?.status)==='refunded'?'refunded':'refund_processing'
    console.info('[mobile/refunds/execute] refund submitted',{correlation_id:correlationId,user_id:auth.user.id,workspace_id:workspaceId,
      organization_id:row.org_id,refund_request_id:requestId,payment_transaction_id:tx.id,stripe_refund_id:refund.id,amount_cents:Number(refund.amount),status:finalStatus})
    return NextResponse.json({success:true,refund_request_id:requestId,stripe_refund_id:refund.id,amount_cents:Number(refund.amount),status:finalStatus,
      idempotency_key:approvedKey||key,request_id:correlationId,correlation_id:correlationId},{headers:{'Cache-Control':'no-store','X-Request-ID':correlationId}})
  }catch(error){safePaymentError('[mobile/refunds/execute] failed',error,{request_id:requestId,user_id:auth.user.id});await insertNotifications([{user_id:row.requester_id,type:'refund_failed',title:'Refund failed',body:'Your refund could not be completed. The organization has been notified.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-failed:${requestId}:requester`,data:{refund_request_id:requestId}},{user_id:auth.user.id,type:'refund_failed',title:'Refund processing failed',body:'A refund submitted for your organization needs attention.',action_url:'/org/refunds',category:'Payments',deduplication_key:`refund-failed:${requestId}:reviewer`,data:{refund_request_id:requestId}}]);const message=error instanceof Error?error.message:'';if(message.includes('No such payment_intent')||message.includes('No such charge'))return fail('ORIGINAL_CHARGE_NOT_FOUND','The original Stripe payment could not be located.',404);if(message.includes('already been refunded'))return fail('REFUND_ALREADY_PROCESSED','The original payment has already been refunded.',409);if(message.includes('exceeds')||message.includes('amount'))return fail('AMOUNT_NOT_REFUNDABLE','The approved amount is not refundable.',422);return fail('STRIPE_REFUND_FAILED','The refund could not be submitted to Stripe.',502)}
}
