import { NextResponse } from 'next/server'
import {
  approveAndProcessRefundRequest,
  REFUND_REQUEST_STATUSES,
  setRefundRequestReviewStatus,
  validateRefundRequestAgainstStripe,
} from '@/lib/refundRequests'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enrichWithWorkspace, recordWorkspaceAdminAudit, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { createAuthenticatedRequestClient } from '@/lib/requestSupabase'
import stripe from '@/lib/stripeServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const requireSuperadmin = async (request: Request) => {
  const user = await getMobileRequestUser(request)
  if (!user) return { user: null, error: jsonError('Unauthorized', 401) }
  const {data:profile}=await supabaseAdmin.from('profiles').select('role').eq('id',user.id).maybeSingle()
  if (profile?.role !== 'superadmin') {
    return { user: null, error: jsonError('Superadmin access required', 403) }
  }
  return { user, error: null }
}

export async function GET(request: Request) {
  const auth = await requireSuperadmin(request)
  if (auth.error) return auth.error
  const params = new URL(request.url).searchParams
  const status = params.get('status')
  const workspaceId = params.get('workspace_id') || ''
  const search = (params.get('query') || '').trim()
  const resolved = search ? await resolveWorkspaceIdsForAdminSearch(search) : null
  if (status && !REFUND_REQUEST_STATUSES.includes(status as never)) {
    return jsonError('Unsupported refund status')
  }
  let query = supabaseAdmin
    .from('payment_refund_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)
  if (workspaceId) query = query.eq('workspace_id', workspaceId)
  else if (resolved?.size) query = query.in('workspace_id', Array.from(resolved))
  const { data, error } = await query
  if (error) return jsonError(error.message, 500)
  const enriched = await enrichWithWorkspace(data || [])
  const lower = search.toLowerCase()
  const matched = enriched.filter((row) => !search || JSON.stringify(row).toLowerCase().includes(lower) || resolved?.has(row.workspace_id))
  const requests = await filterAdminTestRows(matched, shouldShowTestData(params))
  const ids=requests.map((row:any)=>row.id),{data:adjustments}=ids.length?await(supabaseAdmin as any).from('refund_fulfillment_adjustments').select('*').in('refund_request_id',ids):{data:[]}
  const enrichedRequests=requests.map((row:any)=>({...row,status:row.status==='refunded'&&Number(row.refunded_amount_cents||0)<Number(row.approved_amount_cents||row.requested_amount_cents||0)?'partially_refunded':row.status,fulfillment_adjustments:(adjustments||[]).filter((item:any)=>item.refund_request_id===row.id)}))
  return NextResponse.json({ requests:enrichedRequests, items:enrichedRequests })
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin(request)
  if (auth.error) return auth.error
  if (!(await enforcePaymentRateLimit(auth.user!.id, 'refund_action', 10, 300).catch(() => false))) return jsonError('Too many refund requests. Try again later.', 429)
  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.request_id || '').trim()
  const action = String(body?.action || '').trim()
  const note = typeof body?.resolution_note === 'string' ? body.resolution_note : null
  const refundType = body?.refund_type === 'full_org_caused' ? 'full_org_caused' : 'standard'
  if (!requestId) return jsonError('request_id is required')

  try {
    const { data: previousRequest } = await supabaseAdmin.from('payment_refund_requests').select('*').eq('id', requestId).maybeSingle()
    if (!previousRequest) return jsonError('Refund request not found', 404)
    if(['program_registration','training_package','recurring_renewal'].includes(previousRequest.payment_type)&&action==='approve_and_refund'){
      const overrideReason=String(body.override_reason||'').trim(),approvedAmount=Number(body.approved_amount_cents||previousRequest.requested_amount_cents),idempotencyKey=String(body.idempotency_key||crypto.randomUUID())
      if(overrideReason.length<10)return jsonError('A detailed override reason of at least 10 characters is required.',422)
      if(!note?.trim())return jsonError('A resolution note is required.',422)
      const client=await createAuthenticatedRequestClient(request)
      const{data:approved,error:approvalError}=await(client as any).rpc('approve_offering_refund',{p_request_id:requestId,p_approved_amount_cents:approvedAmount,p_resolution_note:note.trim(),p_idempotency_key:idempotencyKey,p_superadmin_override:true,p_override_reason:overrideReason})
      if(approvalError)throw approvalError
      let txQuery=supabaseAdmin.from('payment_transactions').select('stripe_payment_intent_id').order('occurred_at',{ascending:false}).limit(1)
      txQuery=approved.payment_transaction_id?txQuery.eq('id',approved.payment_transaction_id):txQuery.eq('source_record_id',approved.payment_record_id)
      const{data:tx}=await txQuery.maybeSingle();if(!tx?.stripe_payment_intent_id)throw new Error('Original payment unavailable')
      const refund=await stripe.refunds.create({payment_intent:tx.stripe_payment_intent_id,amount:Number(approved.approved_amount_cents),metadata:{refund_request_id:requestId}},{idempotencyKey:`offering-refund-${idempotencyKey}`})
      await supabaseAdmin.from('payment_refund_requests').update({status:'processing',stripe_refund_id:refund.id,stripe_refund_status:refund.status}).eq('id',requestId)
      return NextResponse.json({status:'processing',stripe_refund_id:refund.id})
    }
    if (previousRequest.payment_type !== 'platform_subscription') {
      return jsonError('Organization refunds are read-only here and must be resolved by the receiving organization.', 403)
    }
    if (action === 'validate') {
      const result = await validateRefundRequestAgainstStripe(requestId)
      return NextResponse.json({
        valid: true,
        amount_cents: result.amountCents,
        refundable_balance_cents: result.refundableBalanceCents,
        currency: result.currency,
        payment_intent_id: result.payment.paymentIntentId,
        service_fee_cents: Number(result.intent.metadata?.serviceFeeCents || 0),
      })
    }
    if (action === 'approve' || action === 'approve_and_refund') {
      await supabaseAdmin.from('payment_refund_requests').update({ refund_type: refundType }).eq('id', requestId)
      const result = await approveAndProcessRefundRequest(requestId, note, {
        id: auth.user!.id,
        email: auth.user!.email || null,
      })
      if (previousRequest.workspace_id) await recordWorkspaceAdminAudit({ actorId: auth.user!.id, actorEmail: auth.user!.email,
        workspaceId: previousRequest.workspace_id, eventType: 'superadmin_refund_approved', recordType: 'payment_refund_request', recordId: requestId,
        previousState: previousRequest, newState: result, reason: note || 'Approved through authoritative refund queue' })
      if (action === 'approve_and_refund') {
        if (result.status !== 'processing' || !result.stripe_refund_id) {
          return jsonError('Stripe did not accept the refund for processing', 409)
        }
        await auditPaymentAction({ actorUserId: auth.user!.id, workspaceId: previousRequest.workspace_id,
          organizationId: previousRequest.organization_id, action: 'refund_approved', targetType: 'payment_refund_request',
          targetId: requestId, stripeObjectId: result.stripe_refund_id, result: 'succeeded', metadata: { resolution_note_present: Boolean(note) } })
        return NextResponse.json({ status: 'processing', stripe_refund_id: result.stripe_refund_id })
      }
      return NextResponse.json({ request: result })
    }
    if (action === 'under_review' || action === 'reject' || action === 'cancel') {
      const mapped = action === 'reject' ? 'rejected' : action === 'cancel' ? 'canceled' : 'under_review'
      const result = await setRefundRequestReviewStatus(requestId, mapped, note)
      if (previousRequest.workspace_id) await recordWorkspaceAdminAudit({ actorId: auth.user!.id, actorEmail: auth.user!.email,
        workspaceId: previousRequest.workspace_id, eventType: `superadmin_refund_${mapped}`, recordType: 'payment_refund_request', recordId: requestId,
        previousState: previousRequest, newState: result, reason: note || `Refund moved to ${mapped}` })
      return NextResponse.json({ request: result })
    }
    return jsonError('Unsupported refund action')
  } catch (error) {
    safePaymentError('[admin/refunds] action failed', error, { request_id: requestId, user_id: auth.user!.id })
    return jsonError('Unable to process refund', 400)
  }
}
