import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const requireSuperadmin = async (request: Request) => {
  const user = await getMobileRequestUser(request)
  if (!user) return { user: null, error: jsonError('Unauthorized', 401) }
  const access = resolveAdminAccess(user.user_metadata)
  if (access.teamRole !== 'superadmin') {
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
  return NextResponse.json({ requests, items: requests })
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.request_id || '').trim()
  const action = String(body?.action || '').trim()
  const note = typeof body?.resolution_note === 'string' ? body.resolution_note : null
  if (!requestId) return jsonError('request_id is required')

  try {
    const { data: previousRequest } = await supabaseAdmin.from('payment_refund_requests').select('*').eq('id', requestId).maybeSingle()
    if (!previousRequest) return jsonError('Refund request not found', 404)
    if (action === 'validate') {
      const result = await validateRefundRequestAgainstStripe(requestId)
      return NextResponse.json({
        valid: true,
        amount_cents: result.amountCents,
        refundable_balance_cents: result.refundableBalanceCents,
        currency: result.currency,
        payment_intent_id: result.payment.paymentIntentId,
      })
    }
    if (action === 'approve' || action === 'approve_and_refund') {
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
    return jsonError(error instanceof Error ? error.message : 'Unable to process refund', 400)
  }
}
