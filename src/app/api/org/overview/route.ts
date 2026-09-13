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

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()

  const [orgResult, settingsResult, teamsResult, membersResult, athletesResult, sessionsResult, transactionsResult, feesResult] = await Promise.all([
    supabaseAdmin.from('organizations').select('id,name,org_type').eq('id', context.organizationId).maybeSingle(),
    supabaseAdmin.from('org_settings').select('stripe_account_id').eq('org_id', context.organizationId).maybeSingle(),
    supabaseAdmin.from('org_teams').select('id').eq('org_id', context.organizationId),
    supabaseAdmin.from('organization_memberships').select('user_id,role,status').eq('org_id', context.organizationId).eq('status', 'active'),
    supabaseAdmin.from('athlete_organization_memberships').select('athlete_id,status').eq('org_id', context.organizationId).eq('status', 'active'),
    supabaseAdmin.from('sessions').select('id').eq('org_id', context.organizationId).gte('start_time', monthStart).lt('start_time', monthEnd),
    supabaseAdmin.from('payment_transactions').select('amount_cents,status').eq('org_id', context.organizationId).eq('status', 'succeeded').gte('occurred_at', monthStart).lt('occurred_at', monthEnd),
    supabaseAdmin.from('org_fees').select('id').eq('org_id', context.organizationId),
  ])

  const failure = [orgResult, settingsResult, teamsResult, membersResult, athletesResult, sessionsResult, transactionsResult, feesResult]
    .find(result => result.error)
  if (failure?.error) {
    console.error('[org/overview] authoritative query failed:', failure.error.message)
    return NextResponse.json({ error: 'Unable to load organization data. Please retry.' }, { status: 500 })
  }

  const coachRoles = new Set(['coach', 'assistant_coach', 'head_coach'])
  const coachMemberships = (membersResult.data || []).filter(row => coachRoles.has(String(row.role)))
  const coachIds = Array.from(new Set(coachMemberships.map(row => row.user_id).filter(Boolean)))
  const { data: coachProfiles, error: coachError } = coachIds.length
    ? await supabaseAdmin.from('profiles').select('id,full_name,role').in('id', coachIds).order('full_name')
    : { data: [], error: null }
  if (coachError) return NextResponse.json({ error: 'Unable to load organization coaches. Please retry.' }, { status: 500 })

  const feeIds = (feesResult.data || []).map(row => row.id)
  const { data: assignments, error: assignmentError } = feeIds.length
    ? await supabaseAdmin.from('org_fee_assignments').select('id,status').in('fee_id', feeIds)
    : { data: [], error: null }
  if (assignmentError) return NextResponse.json({ error: 'Unable to load organization fees. Please retry.' }, { status: 500 })

  return NextResponse.json({
    schema_version: '2026-09-12',
    workspace_id: context.workspaceId,
    workspace_is_active: context.isActiveWorkspace,
    organization: orgResult.data,
    role: context.role,
    counts: {
      teams: (teamsResult.data || []).length,
      coaches: coachProfiles?.length || 0,
      athletes: (athletesResult.data || []).length,
      sessions_this_month: (sessionsResult.data || []).length,
      fees: (feesResult.data || []).length,
      unpaid_fees: (assignments || []).filter(row => row.status === 'unpaid').length,
    },
    revenue_this_month_cents: (transactionsResult.data || []).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0),
    stripe_connected: Boolean(settingsResult.data?.stripe_account_id),
    recent_coaches: coachProfiles || [],
  })
}
