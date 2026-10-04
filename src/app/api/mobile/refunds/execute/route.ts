import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireMobileUser, mobileError } from '@/lib/mobilePaymentApi'
import { enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { approveAndProcessRefundRequest, setRefundRequestReviewStatus, type RefundRequestRow } from '@/lib/refundRequests'
import { recordWorkspaceAdminAudit } from '@/lib/workspaceAdmin'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
])

const isAuthorizedForRefund = async (row: RefundRequestRow, userId: string): Promise<'org_director' | 'independent_coach' | 'league_admin' | null> => {
  if (row.org_id) {
    const { data } = await supabaseAdmin.rpc('organization_has_permission', {
      p_org_id: row.org_id,
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

const supportedModes = ['money_refund','credits_only','money_and_credits','rejected'] as const
const fail=(request:Request,code:string,message:string,status:number)=>correlatedError(requestIdFor(request),code,message,status,status===429||status>=500)

async function creditEligibility(row:RefundRequestRow){
  if(!['training_package','recurring_renewal'].includes(row.payment_type))return{eligible:false,restorable_group_credits:0,restorable_one_on_one_credits:0,reason:'This payment did not grant training credits.'}
  const {data:tx}=await supabaseAdmin.from('payment_transactions').select('id,source_record_id,source_record_type,stripe_invoice_id,metadata').eq('id',row.payment_record_id).maybeSingle()
  const metadata=(tx?.metadata&&typeof tx.metadata==='object'?tx.metadata:{}) as Record<string,unknown>
  const purchaseId=String(metadata.purchase_id||tx?.source_record_id||'')
  if(!purchaseId)return{eligible:false,restorable_group_credits:0,restorable_one_on_one_credits:0,reason:'Credit attribution is unavailable.'}
  const {data:purchase}=await supabaseAdmin.from('org_training_package_purchases').select('id,package_id').eq('id',purchaseId).maybeSingle()
  if(!purchase)return{eligible:false,restorable_group_credits:0,restorable_one_on_one_credits:0,reason:'Credit attribution is unavailable.'}
  const {data:pkg}=await supabaseAdmin.from('org_training_packages').select('group_credits,one_on_one_credits').eq('id',purchase.package_id).maybeSingle()
  let restorationQuery=(supabaseAdmin as any).from('refund_credit_restorations').select('group_credits,one_on_one_credits,billing_cycle_key').eq('purchase_id',purchase.id)
  const cycleKey=tx?.stripe_invoice_id||String(metadata.stripe_invoice_id||tx?.id||'')
  if(cycleKey)restorationQuery=restorationQuery.eq('billing_cycle_key',cycleKey)
  const {data:restorations}=await restorationQuery
  const usedGroup=(restorations||[]).reduce((sum:number,item:any)=>sum+Number(item.group_credits||0),0)
  const usedOne=(restorations||[]).reduce((sum:number,item:any)=>sum+Number(item.one_on_one_credits||0),0)
  const group=Math.max(0,Number(pkg?.group_credits||0)-usedGroup),one=Math.max(0,Number(pkg?.one_on_one_credits||0)-usedOne)
  return{eligible:group+one>0,restorable_group_credits:group,restorable_one_on_one_credits:one,reason:group+one>0?null:'No restorable credits remain.'}
}

export async function GET(request:Request){
  const auth=await requireMobileUser(request);if('response'in auth)return auth.response
  const requestId=new URL(request.url).searchParams.get('request_id')?.trim()
  if(!requestId)return fail(request,'refund_request_required','A refund request is required.',422)
  const {data}=await supabaseAdmin.from('payment_refund_requests').select('*').eq('id',requestId).maybeSingle()
  if(!data)return fail(request,'refund_request_not_found','Refund request not found',404)
  const row=data as RefundRequestRow,actingRole=await isAuthorizedForRefund(row,auth.user.id)
  if(!actingRole)return fail(request,'refund_permission_required','You do not have permission to manage this refund.',403)
  const requestedWorkspaceId=request.headers.get('x-workspace-id')?.trim(),workspace=requestedWorkspaceId?await requireWorkspaceContext(auth.user.id,requestedWorkspaceId):null
  if(!workspace||!row.org_id||workspace.type!=='organization'||workspace.organizationId!==row.org_id)return fail(request,'refund_workspace_mismatch','The active workspace does not own this refund request',403)
  return NextResponse.json({refund_request:row,supported_resolution_modes:supportedModes,credit_eligibility:await creditEligibility(row)})
}

export async function POST(request: Request) {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.request_id || '').trim()
  const action = String(body?.action || '').trim()
  const resolutionMode=String(body?.resolution_mode||(action==='approve_and_refund'?'money_refund':'')).trim()
  const resolutionNote = typeof body?.resolution_note === 'string' ? body.resolution_note : null

  if (!requestId) return mobileError('request_id is required', 400)
  if (!supportedModes.includes(resolutionMode as any)) return fail(request,'refund_resolution_invalid','Choose a supported refund resolution.',422)
  if (!resolutionNote?.trim()) return fail(request,'refund_resolution_note_required','A resolution note is required.',422)

  if (!(await enforcePaymentRateLimit(user.id, 'mobile_refund_execute', 10, 300).catch(() => false))) {
    return mobileError('Too many refund attempts. Try again shortly.', 429)
  }

  const { data: refundRequest, error: loadError } = await supabaseAdmin
    .from('payment_refund_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (loadError) return mobileError('Unable to load refund request', 500)
  if (!refundRequest) return mobileError('Refund request not found', 404)

  const row = refundRequest as RefundRequestRow

  const requestedWorkspaceId=request.headers.get('x-workspace-id')?.trim()
  const workspace=requestedWorkspaceId?await requireWorkspaceContext(user.id,requestedWorkspaceId):null
  const workspaceMatches=Boolean(workspace&&(
    (row.org_id&&workspace.type==='organization'&&workspace.organizationId===row.org_id)
    ||(row.league_id&&workspace.type==='league'&&workspace.leagueId===row.league_id)
    ||(row.coach_id&&workspace.type==='independent_coach'&&workspace.ownerUserId===row.coach_id)
  ))
  if(!workspaceMatches)return mobileError('The active workspace does not own this refund request',403)

  if ((row.payment_type as string) === 'platform_subscription') return mobileError('Platform subscription refunds must go through admin', 403)

  const actingRole = await isAuthorizedForRefund(row, user.id)
  if (!actingRole) return mobileError('Forbidden', 403)

  if (!['requested', 'under_review', 'approved'].includes(row.status)) {
    if (row.stripe_refund_id) {
      return NextResponse.json({ status: row.status, stripe_refund_id: row.stripe_refund_id })
    }
    return mobileError('Refund request is not in a refundable state', 409)
  }

  try {
    if(resolutionMode==='rejected'){
      const result=await setRefundRequestReviewStatus(requestId,'rejected',resolutionNote)
      await supabaseAdmin.from('payment_refund_requests').update({resolution_mode:'rejected',resolved_by_org_user_id:user.id,resolution_started_at:new Date().toISOString()}).eq('id',requestId)
      if(row.workspace_id)await recordWorkspaceAdminAudit({actorId:user.id,actorEmail:user.email,workspaceId:row.workspace_id,eventType:'scoped_refund_rejected',recordType:row.payment_type,recordId:requestId,previousState:{status:row.status},newState:{status:'rejected',resolution_mode:'rejected'},reason:resolutionNote,actingRole})
      return NextResponse.json({status:result.status,resolution_mode:'rejected',stripe_refund_id:null,restored_group_credits:0,restored_one_on_one_credits:0})
    }
    await supabaseAdmin.from('payment_refund_requests').update({resolution_mode:resolutionMode,resolved_by_org_user_id:user.id,resolution_started_at:new Date().toISOString(),resolution_note:resolutionNote.trim()}).eq('id',requestId)
    let restored={restored_group_credits:0,restored_one_on_one_credits:0,reused:false}
    if(resolutionMode==='credits_only'||resolutionMode==='money_and_credits'){
      const eligibility=await creditEligibility(row)
      const group=body.group_credits==null?eligibility.restorable_group_credits:Number(body.group_credits)
      const one=body.one_on_one_credits==null?eligibility.restorable_one_on_one_credits:Number(body.one_on_one_credits)
      const {data,error}=await (supabaseAdmin as any).rpc('restore_refund_training_credits',{p_refund_request_id:requestId,p_group_credits:group,p_one_on_one_credits:one,p_actor_user_id:user.id,p_resolution_note:resolutionNote.trim()})
      if(error)throw error
      restored=data||restored
      if(resolutionMode==='credits_only'){
        await supabaseAdmin.from('payment_refund_requests').update({status:'credits_restored',resolved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',requestId)
        return NextResponse.json({status:'credits_restored',resolution_mode:resolutionMode,stripe_refund_id:null,...restored})
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

    return NextResponse.json({ status: result.status, resolution_mode:resolutionMode,stripe_refund_id: result.stripe_refund_id ?? null,...restored })
  } catch (error) {
    safePaymentError('[mobile/refunds/execute] action failed', error, { request_id: requestId, user_id: user.id })
    const {data:latest}=await supabaseAdmin.from('payment_refund_requests').select('status,resolution_mode,restored_group_credits,restored_one_on_one_credits').eq('id',requestId).maybeSingle()
    if(latest?.status==='credits_restored')return NextResponse.json({status:'credits_restored',resolution_mode:latest.resolution_mode,stripe_refund_id:null,
      restored_group_credits:Number(latest.restored_group_credits||0),restored_one_on_one_credits:Number(latest.restored_one_on_one_credits||0),
      money_refund_status:'failed',message:'Credits were restored, but the money refund could not be started.'})
    return mobileError('Unable to process this refund request.', 409, false)
  }
}
