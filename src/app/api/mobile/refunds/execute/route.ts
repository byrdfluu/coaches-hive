import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireMobileUser } from '@/lib/mobilePaymentApi'
import { enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { approveAndProcessRefundRequest, type RefundRequestRow } from '@/lib/refundRequests'
import { recordWorkspaceAdminAudit } from '@/lib/workspaceAdmin'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'
import { parseUuid } from '@/lib/uuid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isAuthorizedForRefund = async (row: RefundRequestRow, userId: string): Promise<'org_director' | 'independent_coach' | 'league_admin' | null> => {
  if (row.organization_id) {
    const { data } = await supabaseAdmin.rpc('organization_has_permission', {
      p_org_id: row.organization_id,
      p_permission: 'manage_payments',
      p_user_id: userId,
    })
    return data ? 'org_director' : null
  }
  if (row.coach_id) {
    return row.coach_id === userId ? 'independent_coach' : null
  }
  if (row.league_id) {
    const { data: isAdmin } = await supabaseAdmin.rpc('is_league_admin', { p_league_id: row.league_id, p_user_id: userId })
    if (isAdmin) return 'league_admin'
    const { data: hasPerm } = await supabaseAdmin.rpc('league_has_permission', {
      p_league_id: row.league_id,
      p_permission: 'manage_payments',
      p_user_id: userId,
    })
    return hasPerm ? 'league_admin' : null
  }
  return null
}

const supportedModes = ['money_refund','credits_only','money_and_credits'] as const
const fail=(request:Request,code:string,message:string,status:number)=>correlatedError(requestIdFor(request),code,message,status,status===429||status>=500)

async function creditEligibility(row:RefundRequestRow){
  if(!['training_package','training_session','recurring_renewal'].includes(row.payment_type))return{eligible:false,restorable_group_credits:0,restorable_one_on_one_credits:0,reason:'This payment did not grant training credits.',code:'credit_restoration_unsupported'}
  let transactionQuery=supabaseAdmin.from('payment_transactions').select('id,source_record_id,source_record_type,stripe_invoice_id,metadata')
  transactionQuery=row.payment_transaction_id?transactionQuery.eq('id',row.payment_transaction_id):transactionQuery.or(`id.eq.${row.payment_record_id},source_record_id.eq.${row.payment_record_id}`)
  const {data:tx}=await transactionQuery.order('occurred_at',{ascending:false}).limit(1).maybeSingle()
  const metadata=(tx?.metadata&&typeof tx.metadata==='object'?tx.metadata:{}) as Record<string,unknown>
  const purchaseId=String(metadata.purchase_id||tx?.source_record_id||'')
  if(!purchaseId)return{eligible:false,restorable_group_credits:0,restorable_one_on_one_credits:0,reason:'Credit attribution is unavailable.',code:'credit_attribution_unavailable'}
  const {data:purchase}=await supabaseAdmin.from('org_training_package_purchases').select('id,package_id').eq('id',purchaseId).maybeSingle()
  if(!purchase)return{eligible:false,restorable_group_credits:0,restorable_one_on_one_credits:0,reason:'Credit attribution is unavailable.',code:'credit_attribution_unavailable'}
  const {data:pkg}=await supabaseAdmin.from('org_training_packages').select('group_credits,one_on_one_credits').eq('id',purchase.package_id).maybeSingle()
  let restorationQuery=(supabaseAdmin as any).from('refund_credit_restorations').select('group_credits,one_on_one_credits,billing_cycle_key').eq('purchase_id',purchase.id)
  const cycleKey=tx?.stripe_invoice_id||String(metadata.stripe_invoice_id||tx?.id||'')
  if(cycleKey)restorationQuery=restorationQuery.eq('billing_cycle_key',cycleKey)
  const {data:restorations}=await restorationQuery
  const usedGroup=(restorations||[]).reduce((sum:number,item:any)=>sum+Number(item.group_credits||0),0)
  const usedOne=(restorations||[]).reduce((sum:number,item:any)=>sum+Number(item.one_on_one_credits||0),0)
  const group=Math.max(0,Number(pkg?.group_credits||0)-usedGroup),one=Math.max(0,Number(pkg?.one_on_one_credits||0)-usedOne)
  return{eligible:group+one>0,restorable_group_credits:group,restorable_one_on_one_credits:one,reason:group+one>0?null:'No restorable credits remain.',code:group+one>0?null:'credits_already_restored'}
}

export async function GET(request:Request){
  const auth=await requireMobileUser(request);if('response'in auth)return auth.response
  const requestId=new URL(request.url).searchParams.get('request_id')?.trim()
  if(!requestId){
    const workspaceId=request.headers.get('x-workspace-id')?.trim(),workspace=workspaceId?await requireWorkspaceContext(auth.user.id,workspaceId):null
    if(!workspace||workspace.type!=='organization'||!workspace.organizationId)return fail(request,'refund_permission_denied','Select an organization workspace with payment-management access.',403)
    const {data:allowed}=await supabaseAdmin.rpc('organization_has_permission',{p_org_id:workspace.organizationId,p_permission:'manage_payments',p_user_id:auth.user.id})
    if(!allowed)return fail(request,'refund_permission_denied','You do not have permission to manage organization refunds.',403)
    const {data:rows,error}=await supabaseAdmin.from('payment_refund_requests').select('*').eq('organization_id',workspace.organizationId).order('requested_at',{ascending:false}).limit(200)
    if(error)return fail(request,'refund_request_unavailable','Refund requests are temporarily unavailable.',503)
    const items=await Promise.all((rows||[]).map(async item=>({...item,credit_eligibility:await creditEligibility(item as RefundRequestRow),supported_resolution_modes:supportedModes})))
    return NextResponse.json({organization_id:workspace.organizationId,refund_requests:items})
  }
  const {data}=await supabaseAdmin.from('payment_refund_requests').select('*').eq('id',requestId).maybeSingle()
  if(!data)return fail(request,'refund_request_not_found','Refund request not found',404)
  const row=data as RefundRequestRow,actingRole=await isAuthorizedForRefund(row,auth.user.id)
  if(!actingRole)return fail(request,'refund_permission_required','You do not have permission to manage this refund.',403)
  const requestedWorkspaceId=request.headers.get('x-workspace-id')?.trim(),workspace=requestedWorkspaceId?await requireWorkspaceContext(auth.user.id,requestedWorkspaceId):null
  if(!workspace||!row.organization_id||workspace.type!=='organization'||workspace.organizationId!==row.organization_id)return fail(request,'refund_workspace_mismatch','The active workspace does not own this refund request',403)
  return NextResponse.json({refund_request:row,supported_resolution_modes:supportedModes,credit_eligibility:await creditEligibility(row)})
}

export async function POST(request: Request) {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.request_id || '').trim()
  const action = String(body?.action || '').trim()
  const resolutionMode=action
  const resolutionNote = typeof body?.resolution_note === 'string' ? body.resolution_note : null
  const headerKey=parseUuid(request.headers.get('idempotency-key')),bodyKey=parseUuid(body?.idempotency_key)

  if (!parseUuid(requestId)) return fail(request,'refund_request_unavailable','A valid refund request is required.',422)
  if(!headerKey||!bodyKey)return fail(request,'idempotency_key_required','A matching UUID Idempotency-Key is required in the header and request body.',422)
  if(headerKey!==bodyKey)return fail(request,'idempotency_conflict','The idempotency keys do not match.',409)
  if (!supportedModes.includes(resolutionMode as any)) return fail(request,'refund_resolution_invalid','Choose a supported refund resolution.',422)
  if (!resolutionNote?.trim()) return fail(request,'refund_resolution_note_required','A resolution note is required.',422)

  if (!(await enforcePaymentRateLimit(user.id, 'mobile_refund_execute', 10, 300).catch(() => false))) {
    return fail(request,'refund_rate_limited','Too many refund attempts. Try again shortly.',429)
  }

  const { data: refundRequest, error: loadError } = await supabaseAdmin
    .from('payment_refund_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (loadError) return fail(request,'refund_request_unavailable','Refund request is temporarily unavailable.',503)
  if (!refundRequest) return fail(request,'refund_request_unavailable','Refund request is unavailable.',404)

  const row = refundRequest as RefundRequestRow

  const requestedWorkspaceId=request.headers.get('x-workspace-id')?.trim()
  const workspace=requestedWorkspaceId?await requireWorkspaceContext(user.id,requestedWorkspaceId):null
  const workspaceMatches=Boolean(workspace&&row.organization_id&&workspace.type==='organization'&&workspace.organizationId===row.organization_id)
  if(!workspaceMatches)return fail(request,'refund_permission_denied','The active organization does not own this refund request.',403)

  if ((row.payment_type as string) === 'platform_subscription') return fail(request,'refund_permission_denied','Platform subscription refunds must be reviewed by Coaches Hive.',403)

  const actingRole = await isAuthorizedForRefund(row, user.id)
  if (!actingRole) return fail(request,'refund_permission_denied','You do not have permission to manage this refund.',403)

  const attemptPayload={refund_request_id:requestId,organization_id:row.organization_id,actor_user_id:user.id,action:resolutionMode,idempotency_key:headerKey,request_id:requestIdFor(request),resolution_note:resolutionNote.trim(),status:'processing'}
  const {data:claimed,error:claimError}=await (supabaseAdmin as any).from('refund_resolution_attempts').insert(attemptPayload).select('*').single()
  let attempt=claimed
  if(claimError?.code==='23505'){
    const {data:existing}=await (supabaseAdmin as any).from('refund_resolution_attempts').select('*').eq('organization_id',row.organization_id).eq('idempotency_key',headerKey).maybeSingle()
    if(!existing||existing.refund_request_id!==requestId||existing.action!==resolutionMode)return fail(request,'idempotency_conflict','This idempotency key was already used for another refund action.',409)
    if(existing.status==='completed'&&existing.response_body)return NextResponse.json(existing.response_body)
    if(existing.status==='processing')return correlatedError(requestIdFor(request),'refund_processing_failed','This refund action is already processing.',409,true)
    attempt=existing
    await (supabaseAdmin as any).from('refund_resolution_attempts').update({status:'processing',updated_at:new Date().toISOString()}).eq('id',existing.id)
  }else if(claimError)return fail(request,'refund_processing_failed','The refund action could not be started.',503)

  const finishAttempt=async(responseBody:Record<string,unknown>)=>{
    await (supabaseAdmin as any).from('refund_resolution_attempts').update({status:'completed',response_body:responseBody,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',attempt.id)
    return NextResponse.json(responseBody)
  }

  if (!['requested', 'under_review', 'approved'].includes(row.status)) {
    if (['credits_restored','refund_processing','refunded','refund_and_credits_completed'].includes(row.status)) {
      return finishAttempt({
        status:row.status,
        stripe_refund_id:row.stripe_refund_id??null,
        restored_group_credits:Number(row.restored_group_credits||0),
        restored_one_on_one_credits:Number(row.restored_one_on_one_credits||0),
      })
    }
    await (supabaseAdmin as any).from('refund_resolution_attempts').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',attempt.id)
    return fail(request,'refund_already_processed','This refund request has already been resolved.',409)
  }

  try {
    await supabaseAdmin.from('payment_refund_requests').update({resolution_mode:resolutionMode,resolved_by_org_user_id:user.id,resolution_started_at:new Date().toISOString(),resolution_note:resolutionNote.trim()}).eq('id',requestId)
    let restored={restored_group_credits:0,restored_one_on_one_credits:0,reused:false}
    if(resolutionMode==='credits_only'||resolutionMode==='money_and_credits'){
      const eligibility=await creditEligibility(row)
      if(!eligibility.eligible)throw Object.assign(new Error(eligibility.reason||'Credit restoration is unsupported'),{stableCode:eligibility.code||'credit_restoration_unsupported'})
      const group=eligibility.restorable_group_credits
      const one=eligibility.restorable_one_on_one_credits
      const {data,error}=await (supabaseAdmin as any).rpc('restore_refund_training_credits',{p_refund_request_id:requestId,p_group_credits:group,p_one_on_one_credits:one,p_actor_user_id:user.id,p_resolution_note:resolutionNote.trim()})
      if(error)throw error
      restored=data||restored
      if(resolutionMode==='credits_only'){
        await supabaseAdmin.from('payment_refund_requests').update({status:'credits_restored',resolved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',requestId)
        return finishAttempt({status:'credits_restored',stripe_refund_id:null,restored_group_credits:Number(restored.restored_group_credits||0),restored_one_on_one_credits:Number(restored.restored_one_on_one_credits||0)})
      }
    }
    const result = await approveAndProcessRefundRequest(requestId, resolutionNote, { id: user.id, email: user.email ?? null })

    if (row.workspace_id) {
      await recordWorkspaceAdminAudit({
        actorId: user.id,
        actorEmail: user.email,
        workspaceId: row.workspace_id,
        eventType: 'scoped_mobile_refund_executed',
        recordType: row.payment_type,
        recordId: requestId,
        previousState: { status: row.status },
        newState: { status: result.status, stripe_refund_id: result.stripe_refund_id },
        reason: resolutionNote || 'Scoped refund executed via mobile app',
        actingRole,
      })
    }

    const responseStatus=resolutionMode==='money_and_credits'&&result.status==='refunded'?'refund_and_credits_completed':result.status==='processing'?'refund_processing':result.status
    return finishAttempt({status:responseStatus,stripe_refund_id:result.stripe_refund_id??null,restored_group_credits:Number(restored.restored_group_credits||0),restored_one_on_one_credits:Number(restored.restored_one_on_one_credits||0)})
  } catch (error) {
    safePaymentError('[mobile/refunds/execute] action failed', error, { request_id: requestId, user_id: user.id })
    const {data:latest}=await supabaseAdmin.from('payment_refund_requests').select('status,resolution_mode,restored_group_credits,restored_one_on_one_credits').eq('id',requestId).maybeSingle()
    if(latest?.status==='credits_restored')return finishAttempt({status:'credits_restored',stripe_refund_id:null,
      restored_group_credits:Number(latest.restored_group_credits||0),restored_one_on_one_credits:Number(latest.restored_one_on_one_credits||0),
      money_refund_status:'failed',message:'Credits were restored, but the money refund could not be started.'})
    await (supabaseAdmin as any).from('refund_resolution_attempts').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',attempt.id)
    const stableCode=error&&typeof error==='object'&&'stableCode'in error?String((error as any).stableCode):'refund_processing_failed'
    return fail(request,stableCode,stableCode==='credits_already_restored'?'Eligible credits were already restored.':stableCode==='credit_attribution_unavailable'?'The original training credit grant could not be verified.':stableCode==='credit_restoration_unsupported'?'This payment did not grant restorable credits.':'The refund could not be processed.',stableCode==='refund_processing_failed'?503:409)
  }
}
