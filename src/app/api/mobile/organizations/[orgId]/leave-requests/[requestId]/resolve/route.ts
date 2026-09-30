import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { authorizeLeaveRequestStaff, organizationDeparturePreflight } from '@/lib/organizationLeaveRequests'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (code: string, message: string, status: number, details?: Record<string, unknown>) =>
  NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; requestId: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Unauthorized.', 401)
  const { orgId, requestId } = await params
  const auth = await authorizeLeaveRequestStaff(request, user, 'mobile organization leave request resolve', orgId)
  if (!auth.ok) return fail(auth.code, 'You do not have permission to resolve this leave request.', auth.status)

  const body = await request.json().catch(() => ({}))
  const decision = String(body.decision || '').trim().toLowerCase()
  const note = String(body.note || '').trim().slice(0, 2000) || null
  if (!['approve', 'decline'].includes(decision)) return fail('invalid_decision', 'decision must be approve or decline.', 422)

  const { data: leaveRequest, error: loadError } = await supabaseAdmin.from('athlete_organization_leave_requests')
    .select('id,athlete_id,org_id,status').eq('id', requestId).eq('org_id', auth.authority.orgId).maybeSingle()
  if (loadError) return fail('leave_request_unavailable', 'Unable to load the leave request.', 500)
  if (!leaveRequest) return fail('leave_request_not_found', 'Leave request not found.', 404)
  if (leaveRequest.status !== 'pending') {
    const expected = decision === 'approve' ? 'approved' : 'declined'
    if (leaveRequest.status === expected) return NextResponse.json({ success: true, request_id: leaveRequest.id, status: leaveRequest.status, idempotent: true })
    return fail('leave_request_already_resolved', 'This leave request has already been resolved.', 409)
  }

  if (decision === 'approve') {
    const preflight = await organizationDeparturePreflight(leaveRequest.org_id, leaveRequest.athlete_id)
    if (preflight.active_recurring_billing > 0) {
      return fail('recurring_billing_active', 'Recurring billing must be canceled first.', 409, preflight)
    }
    if (preflight.unpaid_balances > 0 || preflight.future_registrations > 0) {
      return fail('departure_obligations_remaining', 'Resolve unpaid balances and future registrations before approving departure.', 409, preflight)
    }
  }

  const { data: result, error } = await (supabaseAdmin as any).rpc('resolve_athlete_leave_organization', {
    p_request_id: leaveRequest.id,
    p_actor_user_id: user.id,
    p_decision: decision,
    p_note: note,
  })
  if (error) {
    console.error('[organization/leave-requests] resolve failed', {
      request_id: auth.authority.requestId, leave_request_id: leaveRequest.id, org_id: auth.authority.orgId, decision, error: error.message,
    })
    const message = String(error.message || '')
    if (message.includes('recurring_billing_active')) return fail('recurring_billing_active', 'Recurring billing must be canceled first.', 409)
    if (message.includes('departure_obligations_remaining')) return fail('departure_obligations_remaining', 'Resolve unpaid balances and future registrations before approving departure.', 409)
    return fail('leave_request_resolution_failed', 'Unable to resolve the leave request.', 500)
  }
  const resolved = Array.isArray(result) ? result[0] : result
  return NextResponse.json({ success: true, request_id: leaveRequest.id, status: resolved?.status || (decision === 'approve' ? 'approved' : 'declined') })
}
