import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { organizationDeparturePreflight } from '@/lib/organizationLeaveRequests'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

const authorize = async (userId: string, orgId: string, athleteId: string) => {
  const { data } = await supabaseAdmin.from('athlete_organization_memberships').select('athlete_id')
    .eq('org_id', orgId).eq('athlete_id', athleteId).eq('status', 'active').maybeSingle()
  if (!data) return false
  if (athleteId === userId) return true
  const { data: profile } = await supabaseAdmin.from('athlete_profiles').select('owner_user_id').eq('id', athleteId).maybeSingle()
  return profile?.owner_user_id === userId
}

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url), orgId = url.searchParams.get('org_id') || '', athleteId = url.searchParams.get('athlete_id') || ''
  if (!orgId || !athleteId) return NextResponse.json({ error: 'org_id and athlete_id are required' }, { status: 422 })
  if (!(await authorize(user.id, orgId, athleteId))) return NextResponse.json({ error: 'Active organization membership not found.' }, { status: 403 })
  const [preflight, { data: pending }] = await Promise.all([
    organizationDeparturePreflight(orgId, athleteId),
    supabaseAdmin.from('athlete_organization_leave_requests').select('id,status,created_at').eq('org_id', orgId).eq('athlete_id', athleteId).eq('status', 'pending').maybeSingle(),
  ])
  return NextResponse.json({ preflight, pending_request: pending || null }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})), orgId = String(body.org_id || ''), athleteId = String(body.athlete_id || '')
  if (!orgId || !athleteId || body.confirm !== true) return NextResponse.json({ error: 'Organization, athlete, and confirmation are required.' }, { status: 422 })
  if (!(await authorize(user.id, orgId, athleteId))) return NextResponse.json({ error: 'Active organization membership not found.' }, { status: 403 })
  const preflight = await organizationDeparturePreflight(orgId, athleteId)
  if (!preflight.can_approve) return NextResponse.json({ error: 'Resolve balances, recurring billing, and future registrations before leaving.', preflight }, { status: 409 })
  const supabase = await createRouteHandlerClientCompat()
  const { data, error } = await supabase.rpc('request_athlete_leave_organization', { p_athlete_id: athleteId, p_org_id: orgId, p_confirm: true })
  if (error) return NextResponse.json({ error: error.message || 'Unable to request organization departure.' }, { status: 409 })
  return NextResponse.json({ request: data }, { status: 201 })
}
