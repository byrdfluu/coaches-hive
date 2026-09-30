import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { authorizeLeaveRequestStaff, organizationDeparturePreflight } from '@/lib/organizationLeaveRequests'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message } }, { status })

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Unauthorized.', 401)
  const { orgId } = await params
  const auth = await authorizeLeaveRequestStaff(request, user, 'mobile organization leave requests list', orgId)
  if (!auth.ok) return fail(auth.code, 'You do not have permission to review leave requests.', auth.status)

  const { data, error } = await supabaseAdmin.from('athlete_organization_leave_requests')
    .select('id,athlete_id,org_id,status,request_note,decision_note,requested_by,resolved_by,resolved_at,created_at,updated_at,athlete_profiles(id,full_name,owner_user_id)')
    .eq('org_id', auth.authority.orgId).order('created_at', { ascending: false })
  if (error) {
    console.error('[organization/leave-requests] list failed', { request_id: auth.authority.requestId, org_id: auth.authority.orgId, error: error.message })
    return fail('leave_requests_unavailable', 'Unable to load leave requests.', 500)
  }
  const requests = await Promise.all((data || []).map(async row => ({
    ...row,
    preflight: row.status === 'pending' ? await organizationDeparturePreflight(row.org_id, row.athlete_id) : null,
  })))
  return NextResponse.json({ requests })
}
