import { requireWorkspaceContext, type WorkspaceContext } from '@/lib/workspaceAuthority'

export type MobileSubscriptionOwner = {
  workspace: WorkspaceContext
  ownerType: 'coach' | 'org' | 'league'
  ownerId: string
  organizationId: string | null
  leagueId: string | null
}

export async function resolveMobileSubscriptionOwner(
  userId: string,
  workspaceId: string,
): Promise<MobileSubscriptionOwner | null> {
  const workspace = await requireWorkspaceContext(userId, workspaceId)
  if (!workspace) return null

  const mayManageBilling = workspace.roles.includes('owner')
    || workspace.roles.includes('org_admin')
    || workspace.roles.includes('league_admin')
    || workspace.permissions.manage_billing === true
    || workspace.permissions.manage_payments === true
  if (!mayManageBilling) return null

  if (workspace.type === 'organization' && workspace.organizationId) {
    return {
      workspace,
      ownerType: 'org',
      ownerId: workspace.organizationId,
      organizationId: workspace.organizationId,
      leagueId: null,
    }
  }
  if (workspace.type === 'league' && workspace.leagueId) {
    return {
      workspace,
      ownerType: 'league',
      ownerId: workspace.leagueId,
      organizationId: null,
      leagueId: workspace.leagueId,
    }
  }
  if (workspace.type === 'independent_coach' && workspace.ownerUserId === userId) {
    return {
      workspace,
      ownerType: 'coach',
      ownerId: userId,
      organizationId: null,
      leagueId: null,
    }
  }
  return null
}
