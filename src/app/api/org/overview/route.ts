import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveOrganization } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })

  const url = new URL(request.url)
  const context = await resolveActiveOrganization(session.user.id, {
    requestedWorkspaceId: request.headers.get('x-workspace-id') || url.searchParams.get('workspace_id'),
    currentOrgId: String(session.user.user_metadata?.current_org_id || ''),
  })
  if (!context) return NextResponse.json({ error: 'No active organization is available for this account.' }, { status: 404 })

  const now = new Date().toISOString()

  const [orgResult, settingsResult, teamsResult, membersResult, athletesResult, sessionsResult, feesResult] = await Promise.all([
    supabaseAdmin.from('organizations').select('id,name,org_type').eq('id', context.organizationId).maybeSingle(),
    supabaseAdmin.from('org_settings').select('org_name,profile_image_url,stripe_account_id').eq('org_id', context.organizationId).maybeSingle(),
    supabaseAdmin.from('org_teams').select('id,name,age_group,competition_level,registration_status,roster_capacity').eq('org_id', context.organizationId),
    supabaseAdmin.from('organization_memberships').select('user_id,role,status').eq('org_id', context.organizationId).eq('status', 'active'),
    supabaseAdmin.from('athlete_organization_memberships').select('athlete_id,status').eq('org_id', context.organizationId).eq('status', 'active'),
    supabaseAdmin.from('sessions').select('id,coach_id,athlete_id,start_time,end_time,status').eq('org_id', context.organizationId).eq('status', 'scheduled').gte('start_time', now).order('start_time').limit(50),
    supabaseAdmin.from('org_fee_assignments').select('id,amount_cents,status,due_date').eq('org_id', context.organizationId),
  ])

  const failure = [orgResult, settingsResult, teamsResult, membersResult, athletesResult, sessionsResult, feesResult]
    .find(result => result.error)
  if (failure?.error) {
    console.error('[org/overview] authoritative query failed:', failure.error.message)
    return NextResponse.json({ error: 'Unable to load organization data. Please retry.' }, { status: 500 })
  }

  const teamIds = (teamsResult.data || []).map(row => row.id)
  const { data: coachAssignments, error: coachAssignmentError } = teamIds.length
    ? await supabaseAdmin.from('org_team_coaches').select('team_id,coach_id').in('team_id', teamIds)
    : { data: [], error: null }
  if (coachAssignmentError) return NextResponse.json({ error: 'Unable to load organization coaches. Please retry.' }, { status: 500 })
  const assignedCoachIds = new Set((coachAssignments || []).map(row => row.coach_id))
  const coachRoles = new Set(['coach', 'assistant_coach', 'head_coach'])
  const coachMemberships = (membersResult.data || []).filter(row => coachRoles.has(String(row.role)) || assignedCoachIds.has(row.user_id))
  const coachIds = Array.from(new Set(coachMemberships.map(row => row.user_id).filter(Boolean)))
  const { data: coachProfiles, error: coachError } = coachIds.length
    ? await supabaseAdmin.from('profiles').select('id,full_name,role,avatar_url,email').in('id', coachIds).order('full_name')
    : { data: [], error: null }
  if (coachError) return NextResponse.json({ error: 'Unable to load organization coaches. Please retry.' }, { status: 500 })

  const assignments = feesResult.data || []
  const totalFeesChargedCents = assignments.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0)
  const totalFeesPaidCents = assignments
    .filter(row => row.status === 'paid')
    .reduce((sum, row) => sum + Number(row.amount_cents || 0), 0)
  const organization = {
    ...orgResult.data,
    name: settingsResult.data?.org_name || orgResult.data?.name || 'Organization',
    profile_image_url: settingsResult.data?.profile_image_url || null,
  }

  return NextResponse.json({
    schema_version: '2026-09-12',
    workspace_id: context.workspaceId,
    workspace_is_active: context.isActiveWorkspace,
    organization,
    role: context.role,
    counts: {
      teams: (teamsResult.data || []).length,
      coaches: coachProfiles?.length || 0,
      athletes: (athletesResult.data || []).length,
      upcoming_sessions: (sessionsResult.data || []).length,
      sessions_this_month: (sessionsResult.data || []).length,
      fees: assignments.length,
      unpaid_fees: (assignments || []).filter(row => row.status === 'unpaid').length,
    },
    total_fees_charged_cents: totalFeesChargedCents,
    total_fees_paid_cents: totalFeesPaidCents,
    revenue_this_month_cents: totalFeesPaidCents,
    stripe_connected: Boolean(settingsResult.data?.stripe_account_id),
    teams: teamsResult.data || [],
    athletes: athletesResult.data || [],
    upcoming_sessions: sessionsResult.data || [],
    recent_coaches: coachProfiles || [],
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
