import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { headers } from 'next/headers'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { normalizeUuid } from '@/lib/uuid'

export type ActiveCoachContext = {
  workspaceId: string | null
  organizationId: string | null
  teamId: string | null
  independent: boolean
}

export async function resolveActiveCoachContext(userId: string): Promise<ActiveCoachContext> {
  const requestHeaders = await headers()
  const workspaceId = normalizeUuid(requestHeaders.get('x-workspace-id')) || null
  const selectedTeamId = normalizeUuid(requestHeaders.get('x-team-id')) || null
  if (!workspaceId) return { workspaceId: null, organizationId: null, teamId: null, independent: true }
  const workspace = await requireWorkspaceContext(userId, workspaceId)
  if (!workspace || !workspace.roles.some(role => ['coach', 'assistant_coach', 'owner'].includes(role))) {
    return { workspaceId: null, organizationId: null, teamId: null, independent: true }
  }
  if (workspace.type !== 'organization' || !workspace.organizationId) {
    return { workspaceId, organizationId: null, teamId: null, independent: true }
  }
  let teamId: string | null = null
  if (selectedTeamId) {
    const { data: assignment } = await supabaseAdmin.from('org_team_coaches').select('team_id,org_teams!inner(org_id)')
      .eq('coach_id', userId).eq('team_id', selectedTeamId).eq('org_teams.org_id', workspace.organizationId).maybeSingle()
    if (assignment) teamId = selectedTeamId
  }
  return { workspaceId, organizationId: workspace.organizationId, teamId, independent: false }
}
