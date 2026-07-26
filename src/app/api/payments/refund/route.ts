import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { approveAndProcessRefundRequest } from '@/lib/refundRequests'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (resolveAdminAccess(session.user.user_metadata).teamRole !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const requestId = String(body?.refund_request_id || '').trim()
  if (!requestId) {
    return NextResponse.json({ error: 'refund_request_id is required' }, { status: 400 })
  }

  try {
    const refundRequest = await approveAndProcessRefundRequest(
      requestId,
      typeof body?.resolution_note === 'string' ? body.resolution_note : null,
    )
    return NextResponse.json({ refund_request: refundRequest })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process refund' },
      { status: 400 },
    )
  }
}
