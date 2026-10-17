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
const SUPPORTED_REFUND_PAYMENT_TYPES=new Set(['program_registration','training_package','recurring_renewal','org_fee','coach_fee','marketplace_order','league_fee'])

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
  const context:Record<string,unknown>={request_id:correlationId,authenticated_user_id:null,workspace_id:null,organization_id:null,
    refund_request_id:null,payment_record_id:null,payment_type:null,action:null,approved_amount_cents:null,idempotency_key:null,
    authorization_result:'not_checked',connected_stripe_account_id:null,stripe_context:null,stripe_payment_id:null,
    stripe_refund_id:null,stripe_error_code:null,database_reconciliation_result:null,route:'/api/mobile/refunds/execute'}
  const failure=(code:string,message:string,status:number,retryable=status===429||status>=500)=>{
    console.error('[mobile/refunds/execute] attempt',{...context,final_http_status:status,error_code:code})
    return NextResponse.json({error:code,message:safeMobileMessage(message,status),request_id:correlationId,retryable},
      {status,headers:{'Cache-Control':'no-store','x-request-id':correlationId}})
  }
  const success=(payload:Record<string,unknown>,status=200,replay=false)=>{
    console.info('[mobile/refunds/execute] attempt',{...context,stripe_refund_id:payload.stripe_refund_id||null,final_http_status:status,error_code:null})
    return NextResponse.json({...payload,request_id:correlationId},{status,headers:{'Cache-Control':'no-store','x-request-id':correlationId,
      ...(replay?{'x-idempotent-replay':'true'}:{})}})
  }

  const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if(!bearer)return failure('AUTHENTICATION_REQUIRED','A valid mobile access token is required.',401)
  const auth=await loadContext(request)
  if('error'in auth)return failure('AUTHENTICATION_REQUIRED','A valid mobile access token is required.',401)
  context.authenticated_user_id=auth.user.id

  let body:Record<string,any>
  try{body=await request.json()}catch{return failure('MALFORMED_REQUEST','The request body must be valid JSON.',400)}
  const refundRequestId=parseUuid(body.request_id),workspaceId=parseUuid(request.headers.get('x-workspace-id'))
  const headerKey=parseUuid(request.headers.get('idempotency-key')),bodyKey=parseUuid(body.idempotency_key)
  const action=String(body.action||''),note=String(body.resolution_note||'').trim()
  Object.assign(context,{workspace_id:workspaceId,refund_request_id:refundRequestId,action,idempotency_key:bodyKey})
  if(!refundRequestId||!workspaceId||!headerKey||!bodyKey)return failure('MALFORMED_REQUEST','Valid request, workspace, and idempotency UUIDs are required.',400)
  if(headerKey!==bodyKey)return failure('REFUND_IDEMPOTENCY_CONFLICT','The Idempotency-Key header must match the request body.',409)
  if(!['money_refund','under_review','reject'].includes(action)||note.length<3)return failure('MALFORMED_REQUEST','Choose a valid action and provide a resolution note.',400)
  if(!(await enforcePaymentRateLimit(auth.user.id,'mobile_refund_execute',10,300).catch(()=>false)))return failure('RATE_LIMITED','Too many refund attempts. Try again shortly.',429,true)

  const [{data:workspace},{data:refundRow}]=await Promise.all([
    supabaseAdmin.from('business_workspaces').select('id,workspace_type,organization_id,status').eq('id',workspaceId).eq('workspace_type','organization').eq('status','active').maybeSingle(),
    (supabaseAdmin as any).from('payment_refund_requests').select('*').eq('id',refundRequestId).maybeSingle(),
  ])
  if(!refundRow)return failure('REFUND_REQUEST_NOT_FOUND','Refund request not found.',404)
  Object.assign(context,{organization_id:refundRow.org_id,payment_record_id:refundRow.payment_record_id,payment_type:refundRow.payment_type,
    approved_amount_cents:refundRow.approved_amount_cents})
  if(!workspace?.organization_id||workspace.organization_id!==refundRow.org_id)return failure('REFUND_EXECUTION_FORBIDDEN','The active workspace cannot execute this refund.',403)
  const [{data:workspaceMembership},{data:legacyAllowed}]=await Promise.all([
    supabaseAdmin.from('workspace_memberships').select('roles,status').eq('workspace_id',workspaceId).eq('user_id',auth.user.id).eq('status','active').maybeSingle(),
    supabaseAdmin.rpc('can_manage_org_refunds',{p_org_id:refundRow.org_id,p_user_id:auth.user.id}),
  ])
  const workspaceAllowed=Array.isArray(workspaceMembership?.roles)&&workspaceMembership!.roles.some(role=>['owner','org_admin','admin'].includes(String(role)))
  context.authorization_result=workspaceAllowed||legacyAllowed===true?'allowed':'denied'
  if(context.authorization_result==='denied')return failure('REFUND_EXECUTION_FORBIDDEN','Refund-management access is required for this organization.',403)

  if(action!=='money_refund'){
    const client=await createAuthenticatedRequestClient(request),status=action==='reject'?'rejected':'under_review'
    const {data:resolved,error}=await(client as any).rpc('resolve_payment_refund_request',{request_id:refundRequestId,new_status:status,resolution_note:note})
    if(error){const raw=String(error.message||'');return raw.includes('FORBIDDEN')?failure('REFUND_EXECUTION_FORBIDDEN','Refund-management access is required for this organization.',403)
      :raw.includes('ALREADY_FINAL')?failure('REFUND_STATE_CONFLICT','This refund request is already final.',409)
        :failure('REFUND_UPDATE_FAILED','The refund request could not be updated.',503,true)}
    if(status==='rejected')await insertNotifications({user_id:refundRow.requester_id,type:'refund_rejected',title:'Refund request rejected',body:'Your refund request was reviewed and rejected.',action_url:'/athlete/refunds',category:'Payments',deduplication_key:`refund-rejected:${refundRequestId}`,data:{refund_request_id:refundRequestId}}).catch((error)=>{
      console.warn('[mobile/refunds/execute] non-authoritative notification failed',{request_id:correlationId,refund_request_id:refundRequestId,error_code:(error as {code?:string})?.code||'NOTIFICATION_FAILED'})
    })
    return success({success:true,refund_request_id:refundRequestId,status:resolved?.status||status,idempotency_key:bodyKey})
  }

  const storedKey=parseUuid(refundRow.idempotency_key),storedAmount=Number(refundRow.approved_amount_cents),bodyAmount=Number(body.approved_amount_cents)
  if(!storedKey||storedKey!==headerKey)return failure('REFUND_IDEMPOTENCY_CONFLICT','This refund was approved with a different idempotency key.',409)
  if(refundRow.stripe_refund_id&&['refunded','processing','refund_processing'].includes(String(refundRow.status)))return success({success:true,
    refund_request_id:refundRequestId,status:refundRow.status==='refunded'?'refunded':'refund_processing',stripe_refund_id:refundRow.stripe_refund_id,
    refunded_amount_cents:Number(refundRow.refunded_amount_cents||storedAmount),idempotency_key:storedKey},200,true)
  if(!['approved','processing','refund_processing'].includes(String(refundRow.status)))return failure('REFUND_STATE_CONFLICT','This refund request is not approved for execution.',409)
  if(!Number.isSafeInteger(storedAmount)||storedAmount<1||bodyAmount!==storedAmount)return failure('REFUND_AMOUNT_CONFLICT','The requested amount does not match the approved refund amount.',409)
  if(!SUPPORTED_REFUND_PAYMENT_TYPES.has(String(refundRow.payment_type)))return failure('UNSUPPORTED_PAYMENT_TYPE','This payment type cannot be refunded through the organization workflow.',422)

  const transactionFields='id,org_id,source_record_id,source_record_type,status,stripe_payment_intent_id,stripe_charge_id,gross_amount_cents,amount_cents,refunded_amount_cents,metadata'
  let txQuery=supabaseAdmin.from('payment_transactions').select(transactionFields).order('occurred_at',{ascending:false}).limit(1)
  txQuery=refundRow.payment_transaction_id?txQuery.eq('id',refundRow.payment_transaction_id):txQuery.or(`id.eq.${refundRow.payment_record_id},source_record_id.eq.${refundRow.payment_record_id}`)
  let {data:transaction}=await txQuery.maybeSingle()
  if(!transaction){
    const tableByType:Record<string,{table:string;amount:string[]}>= {
      org_fee:{table:'org_fee_assignments',amount:['amount']},coach_fee:{table:'coach_fee_assignments',amount:['amount']},
      marketplace_order:{table:'marketplace_orders',amount:['total_amount','amount']},league_fee:{table:'league_fee_assignments',amount:['amount_cents']},
      program_registration:{table:'program_registrations',amount:[]},training_package:{table:'org_training_package_purchases',amount:[]},
    }
    const fallback=tableByType[String(refundRow.payment_type)]
    if(fallback){
      const {data:record}=await(supabaseAdmin as any).from(fallback.table).select('*').eq('id',refundRow.payment_record_id).maybeSingle()
      if(record){
        const dollars=fallback.amount.find(field=>record[field]!=null&&field!=='amount_cents')
        const cents=fallback.amount.includes('amount_cents')?Number(record.amount_cents||0):Math.round(Number(dollars?record[dollars]:0)*100)
        transaction={id:refundRow.payment_record_id,org_id:record.org_id||refundRow.org_id,source_record_id:refundRow.payment_record_id,
          source_record_type:refundRow.payment_type,status:record.payment_status||record.status,stripe_payment_intent_id:record.stripe_payment_intent_id,
          stripe_charge_id:record.stripe_charge_id,gross_amount_cents:cents,amount_cents:cents,refunded_amount_cents:Number(record.refunded_amount_cents||0),metadata:record.metadata||{}} as any
      }
    }
  }
  if(!transaction||transaction.org_id!==refundRow.org_id||(!transaction.stripe_payment_intent_id&&!transaction.stripe_charge_id))return failure('ORIGINAL_CHARGE_NOT_FOUND','The original payment could not be located.',422)
  if(!['paid','succeeded','complete','completed','refunded','partially_refunded'].includes(String(transaction.status||'').toLowerCase()))return failure('ORIGINAL_PAYMENT_NOT_SUCCEEDED','The original payment has not completed successfully.',422)
  context.stripe_payment_id=transaction.stripe_payment_intent_id||transaction.stripe_charge_id

  const [{data:connect},{data:accounting}]=await Promise.all([
    supabaseAdmin.from('stripe_connect_accounts').select('stripe_account_id,charges_enabled,connect_status').eq('owner_type','org').eq('owner_id',refundRow.org_id).maybeSingle(),
    transaction.stripe_payment_intent_id?(supabaseAdmin as any).from('stripe_connect_payment_accounting').select('workspace_id,stripe_payment_intent_id,stripe_metadata').eq('stripe_payment_intent_id',transaction.stripe_payment_intent_id).maybeSingle():Promise.resolve({data:null}),
  ])
  if(!connect?.stripe_account_id||connect.charges_enabled!==true||connect.connect_status!=='enabled')return failure('STRIPE_ACCOUNT_NOT_READY','The organization Stripe account is not ready to process refunds.',422)
  context.connected_stripe_account_id=connect.stripe_account_id
  if(accounting?.workspace_id&&accounting.workspace_id!==workspaceId)return failure('STRIPE_ACCOUNT_MISMATCH','The original payment belongs to a different Stripe workspace.',422)

  let directCharge=false,verifiedCharge:any=null
  try{
    if(transaction.stripe_payment_intent_id){
      try{
        const intent=await stripe.paymentIntents.retrieve(transaction.stripe_payment_intent_id,{expand:['latest_charge']})
        if(intent.status!=='succeeded')return failure('ORIGINAL_PAYMENT_NOT_SUCCEEDED','The original payment has not completed successfully.',422)
        const destination=typeof intent.transfer_data?.destination==='string'?intent.transfer_data.destination:intent.transfer_data?.destination?.id
        if(!destination||destination!==connect.stripe_account_id)return failure('STRIPE_ACCOUNT_MISMATCH','The original payment belongs to a different Stripe account.',422)
        verifiedCharge=typeof intent.latest_charge==='object'?intent.latest_charge:null
      }catch(platformError){
        const code=(platformError as {code?:string}).code
        if(code!=='resource_missing')throw platformError
        const intent=await stripe.paymentIntents.retrieve(transaction.stripe_payment_intent_id,{expand:['latest_charge']},{stripeAccount:connect.stripe_account_id})
        if(intent.status!=='succeeded')return failure('ORIGINAL_PAYMENT_NOT_SUCCEEDED','The original payment has not completed successfully.',422)
        verifiedCharge=typeof intent.latest_charge==='object'?intent.latest_charge:null;directCharge=true
      }
    }else if(transaction.stripe_charge_id){
      try{verifiedCharge=await stripe.charges.retrieve(transaction.stripe_charge_id!)}catch(platformError){const code=(platformError as {code?:string}).code;if(code!=='resource_missing')throw platformError
        verifiedCharge=await stripe.charges.retrieve(transaction.stripe_charge_id!,{stripeAccount:connect.stripe_account_id});directCharge=true}
    }
    if(!verifiedCharge||verifiedCharge.status!=='succeeded'||verifiedCharge.paid!==true)return failure('ORIGINAL_PAYMENT_NOT_SUCCEEDED','The original Stripe charge has not completed successfully.',422)
    const remaining=Math.max(0,Number(verifiedCharge.amount||0)-Number(verifiedCharge.amount_refunded||0))
    if(storedAmount>remaining)return failure(remaining===0?'REFUND_ALREADY_PROCESSED':'AMOUNT_NOT_REFUNDABLE',remaining===0?'The original payment has already been fully refunded.':'The approved amount exceeds the remaining refundable amount.',remaining===0?409:422)
    context.stripe_context=directCharge?'direct_connected_charge':'destination_charge'
  }catch(error){safePaymentError('[mobile/refunds/execute] original payment verification failed',error,{request_id:correlationId,user_id:auth.user.id})
    context.stripe_error_code=(error as {code?:string})?.code||'STRIPE_VERIFICATION_FAILED'
    return failure('ORIGINAL_CHARGE_NOT_FOUND','The original payment could not be verified.',422)}

  if(!refundRow.stripe_refund_id){
    const {data:claimed,error:claimError}=await(supabaseAdmin as any).from('payment_refund_requests').update({status:'refund_processing',updated_at:new Date().toISOString()})
      .eq('id',refundRequestId).eq('status','approved').eq('idempotency_key',storedKey).select('id').maybeSingle()
    if(claimError)return failure('REFUND_STATE_UPDATE_FAILED','The refund could not be prepared for Stripe.',503,true)
    if(!claimed&&refundRow.status==='approved')return failure('REFUND_STATE_CONFLICT','Another refund attempt is already processing.',409)
  }

  try{
    const refund=await stripe.refunds.create({...(transaction.stripe_payment_intent_id?{payment_intent:transaction.stripe_payment_intent_id}:{charge:transaction.stripe_charge_id!}),
      amount:storedAmount,...(!directCharge?{reverse_transfer:true,refund_application_fee:true}:{}),metadata:{refund_request_id:refundRequestId,organization_id:refundRow.org_id}},
      {idempotencyKey:storedKey,...(directCharge?{stripeAccount:connect.stripe_account_id}:{})})
    context.stripe_refund_id=refund.id
    const {data:applied,error:applyError}=await(supabaseAdmin as any).rpc('apply_offering_refund_result',{p_request_id:refundRequestId,p_stripe_refund_id:refund.id,
      p_refunded_amount_cents:Number(refund.amount),p_stripe_status:String(refund.status||'pending'),p_receipt_url:null})
    if(applyError){context.database_reconciliation_result=`failed:${applyError.code||'unknown'}`;return failure('REFUND_RECONCILIATION_FAILED','Stripe accepted the refund, but confirmation is still being reconciled. Retry with the same idempotency key.',503,true)}
    context.database_reconciliation_result='applied'
    const finalStatus=String(applied?.status)==='refunded'||refund.status==='succeeded'?'refunded':'refund_processing'
    const reconciliation={status:finalStatus,stripe_refund_id:refund.id,refunded_amount_cents:Number(refund.amount),
      ...(finalStatus==='refunded'?{resolved_at:new Date().toISOString()}:{}),updated_at:new Date().toISOString()}
    const {error:reconciliationError}=await(supabaseAdmin as any).from('payment_refund_requests').update(reconciliation).eq('id',refundRequestId).eq('stripe_refund_id',refund.id)
    if(reconciliationError){context.database_reconciliation_result=`failed:${reconciliationError.code||'unknown'}`;return failure('REFUND_RECONCILIATION_FAILED','Stripe accepted the refund, but confirmation is still being reconciled. Retry with the same idempotency key.',503,true)}
    await insertNotifications({user_id:refundRow.requester_id,type:finalStatus==='refunded'?'refund_completed':'refund_processing',
      title:finalStatus==='refunded'?'Refund completed':'Refund processing',body:finalStatus==='refunded'?'Your approved refund was completed.':'Stripe is processing your approved refund.',
      action_url:'/athlete/refunds',category:'Payments',deduplication_key:`${finalStatus}:${refundRequestId}`,data:{refund_request_id:refundRequestId,stripe_refund_id:refund.id}}).catch((error)=>{
      console.warn('[mobile/refunds/execute] non-authoritative notification failed',{request_id:correlationId,refund_request_id:refundRequestId,error_code:(error as {code?:string})?.code||'NOTIFICATION_FAILED'})
    })
    return success({success:true,refund_request_id:refundRequestId,status:finalStatus,stripe_refund_id:refund.id,refunded_amount_cents:Number(refund.amount),idempotency_key:storedKey},finalStatus==='refunded'?200:202)
  }catch(error){safePaymentError('[mobile/refunds/execute] Stripe refund failed',error,{request_id:correlationId,user_id:auth.user.id})
    context.stripe_error_code=(error as {code?:string})?.code||'STRIPE_REFUND_FAILED'
    const message=error instanceof Error?error.message:''
    if(message.includes('already been refunded'))return failure('REFUND_STATE_CONFLICT','The original payment has already been refunded.',409)
    if(message.includes('exceeds')||message.includes('amount'))return failure('AMOUNT_NOT_REFUNDABLE','The approved amount is not refundable.',422)
    return failure('STRIPE_REFUND_FAILED','Stripe could not process the refund. Please try again.',503,true)}
}
