import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import {
  approveAndProcessRefundRequest,
  REFUND_REQUEST_STATUSES,
  setRefundRequestReviewStatus,
  validateRefundRequestAgainstStripe,
} from '@/lib/refundRequests'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enrichWithWorkspace, recordWorkspaceAdminAudit, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const requireSuperadmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { session: null, error: jsonError('Unauthorized', 401) }
  const access = resolveAdminAccess(session.user.user_metadata)
  if (access.teamRole !== 'superadmin') {
    return { session: null, error: jsonError('Superadmin access required', 403) }
  }
  return { session, error: null }
}

export async function GET(request: Request) {
  const auth = await requireSuperadmin()
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
  const requests = enriched.filter((row) => !search || JSON.stringify(row).toLowerCase().includes(lower) || resolved?.has(row.workspace_id))
  return NextResponse.json({ requests, items: requests })
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin()
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
    if (action === 'approve') {
      const result = await approveAndProcessRefundRequest(requestId, note)
      if (previousRequest.workspace_id) await recordWorkspaceAdminAudit({ actorId: auth.session!.user.id, actorEmail: auth.session!.user.email,
        workspaceId: previousRequest.workspace_id, eventType: 'superadmin_refund_approved', recordType: 'payment_refund_request', recordId: requestId,
        previousState: previousRequest, newState: result, reason: note || 'Approved through authoritative refund queue' })
      return NextResponse.json({ request: result })
    }
    if (action === 'under_review' || action === 'reject' || action === 'cancel') {
      const mapped = action === 'reject' ? 'rejected' : action === 'cancel' ? 'canceled' : 'under_review'
      const result = await setRefundRequestReviewStatus(requestId, mapped, note)
      if (previousRequest.workspace_id) await recordWorkspaceAdminAudit({ actorId: auth.session!.user.id, actorEmail: auth.session!.user.email,
        workspaceId: previousRequest.workspace_id, eventType: `superadmin_refund_${mapped}`, recordType: 'payment_refund_request', recordId: requestId,
        previousState: previousRequest, newState: result, reason: note || `Refund moved to ${mapped}` })
      return NextResponse.json({ request: result })
    }
    return jsonError('Unsupported refund action')
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to process refund', 400)
  }
}
