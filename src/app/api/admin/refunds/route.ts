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
  const status = new URL(request.url).searchParams.get('status')
  if (status && !REFUND_REQUEST_STATUSES.includes(status as never)) {
    return jsonError('Unsupported refund status')
  }
  let query = supabaseAdmin
    .from('payment_refund_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ requests: data || [] })
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
      return NextResponse.json({ request: result })
    }
    if (action === 'under_review' || action === 'reject' || action === 'cancel') {
      const mapped = action === 'reject' ? 'rejected' : action === 'cancel' ? 'canceled' : 'under_review'
      const result = await setRefundRequestReviewStatus(requestId, mapped, note)
      return NextResponse.json({ request: result })
    }
    return jsonError('Unsupported refund action')
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to process refund', 400)
  }
}
