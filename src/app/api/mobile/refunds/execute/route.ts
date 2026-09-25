import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireMobileUser, mobileError } from '@/lib/mobilePaymentApi'
import { enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { approveAndProcessRefundRequest, type RefundRequestRow } from '@/lib/refundRequests'
import { recordWorkspaceAdminAudit } from '@/lib/workspaceAdmin'

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

export async function POST(request: Request) {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.request_id || '').trim()
  const action = String(body?.action || '').trim()
  const resolutionNote = typeof body?.resolution_note === 'string' ? body.resolution_note : null

  if (!requestId) return mobileError('request_id is required', 400)
  if (action !== 'approve_and_refund') return mobileError('Unsupported action', 400)

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

  if ((row.payment_type as string) === 'platform_subscription') {
    return mobileError('Platform subscription refunds must go through admin', 403)
  }

  const actingRole = await isAuthorizedForRefund(row, user.id)
  if (!actingRole) return mobileError('Forbidden', 403)

  if (!['requested', 'under_review', 'approved'].includes(row.status)) {
    if (row.stripe_refund_id) {
      return NextResponse.json({ status: row.status, stripe_refund_id: row.stripe_refund_id })
    }
    return mobileError('Refund request is not in a refundable state', 409)
  }

  try {
    const result = await approveAndProcessRefundRequest(requestId, resolutionNote, {
      id: user.id,
      email: user.email ?? null,
    })

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

    return NextResponse.json({ status: result.status, stripe_refund_id: result.stripe_refund_id ?? null })
  } catch (error) {
    safePaymentError('[mobile/refunds/execute] action failed', error, { request_id: requestId, user_id: user.id })
    return mobileError(error instanceof Error ? error.message : 'Unable to process refund', 400)
  }
}
