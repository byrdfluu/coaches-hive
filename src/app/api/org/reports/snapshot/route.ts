import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','coach']
const timestamp = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return error
  const orgId = await resolveActiveOrganizationId(session.user.id)
  if (!orgId) return jsonError('Organization not found', 404)
  const url = new URL(request.url)
  const from = timestamp(url.searchParams.get('from'))
  const through = timestamp(url.searchParams.get('through'))
  if (from === undefined || through === undefined) return jsonError('Invalid reporting date range', 422)
  const { data, error: snapshotError } = await (supabaseAdmin as any).rpc('org_reporting_snapshot', {
    p_org_id: orgId, p_from: from, p_through: through,
  })
  if (snapshotError) {
    console.error('[org/reports/snapshot] failed', { org_id: orgId, code: snapshotError.code })
    return jsonError('Unable to load organization reporting.', 503)
  }
  return NextResponse.json({ organization_id: orgId, from, through, snapshot: data || {} }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
