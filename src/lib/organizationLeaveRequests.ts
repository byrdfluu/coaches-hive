import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeWorkspaceRequest, logWorkspaceAuthority, workspaceCan, type WorkspaceContext } from '@/lib/workspaceAuthority'
import { normalizeUuid } from '@/lib/uuid'
import { requestIdFor } from '@/lib/requestSecurity'

const DIRECTOR_ROLES = new Set([
  'owner', 'org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director',
])

export type LeaveStaffAuthority = { user: User; workspace: WorkspaceContext; orgId: string; requestId: string }

export async function authorizeLeaveRequestStaff(request: Request, user: User, route: string, orgId: string) {
  const requestId = requestIdFor(request)
  const result = await authorizeWorkspaceRequest({ request, userId: user.id, expectedType: 'organization' })
  logWorkspaceAuthority({ requestId, userId: user.id, request, route, result })
  if (!result.ok) return { ok: false as const, code: result.code, status: result.status, requestId }
  if (normalizeUuid(result.workspace.organizationId) !== normalizeUuid(orgId)) {
    return { ok: false as const, code: 'workspace_context_mismatch', status: 409 as const, requestId }
  }
  const authorized = result.workspace.roles.some(role => DIRECTOR_ROLES.has(role))
    || workspaceCan(result.workspace, 'manage_members')
    || workspaceCan(result.workspace, 'members.manage')
  if (!authorized) return { ok: false as const, code: 'missing_permission', status: 403 as const, requestId }
  return { ok: true as const, authority: { user, workspace: result.workspace, orgId, requestId } }
}

export async function organizationDeparturePreflight(orgId: string, athleteId: string) {
  const now = new Date().toISOString()
  const [{ count: teamAssignments }, { count: unpaidBalances }, { count: recurringBilling }, { count: futureRegistrations }] = await Promise.all([
    supabaseAdmin.from('org_team_members').select('id,org_teams!inner(org_id)', { count: 'exact', head: true })
      .eq('athlete_id', athleteId).eq('org_teams.org_id', orgId),
    supabaseAdmin.from('org_fee_assignments').select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId).eq('org_id', orgId).in('status', ['pending', 'due', 'overdue', 'past_due', 'processing']),
    supabaseAdmin.from('organization_recurring_fees').select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId).eq('organization_id', orgId).in('status', ['active', 'trialing', 'past_due', 'paused', 'processing']),
    supabaseAdmin.from('program_registrations').select('id,programs!inner(org_id,start_date)', { count: 'exact', head: true })
      .eq('athlete_profile_id', athleteId).eq('programs.org_id', orgId).gte('programs.start_date', now.slice(0, 10))
      .in('status', ['pending', 'paid', 'active', 'registered']),
  ])
  return {
    team_assignments: teamAssignments || 0,
    unpaid_balances: unpaidBalances || 0,
    active_recurring_billing: recurringBilling || 0,
    future_registrations: futureRegistrations || 0,
    can_approve: !(unpaidBalances || recurringBilling || futureRegistrations),
  }
}
