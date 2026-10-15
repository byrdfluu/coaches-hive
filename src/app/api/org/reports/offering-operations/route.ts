import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
import { requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','coach']

export async function GET(request: Request) {
  const requestId = requestIdFor(request)
  const { session, supabase, error } = await getSessionRole(ROLES)
  if (error || !session) return error
  const orgId = await resolveActiveOrganizationId(session.user.id)
  if (!orgId) return jsonError('Organization not found.', 404)
  const { data, error: snapshotError } = await (supabase as any).rpc('org_offering_operations_snapshot', { p_org_id: orgId })
  if (snapshotError) {
    console.error('[org/reports/offering-operations] failed', { request_id: requestId, org_id: orgId, code: snapshotError.code })
    const forbidden = String(snapshotError.code) === '42501'
    return NextResponse.json({ error: forbidden ? 'You do not have permission to view offering operations.' : 'Offering operations are temporarily unavailable.', request_id: requestId }, { status: forbidden ? 403 : 503 })
  }
  return NextResponse.json({ organization_id: orgId, snapshot: data || {}, request_id: requestId }, { headers: { 'Cache-Control': 'private, no-store' } })
}
