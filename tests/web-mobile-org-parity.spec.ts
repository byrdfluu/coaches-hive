import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

test('org overview is server-authoritative and workspace scoped', () => {
  const route = source('src/app/api/org/overview/route.ts')
  expect(route).toContain('resolveActiveOrganization')
  for (const table of ['org_teams', 'organization_memberships', 'athlete_organization_memberships', 'sessions', 'payment_transactions']) {
    expect(route).toContain(`from('${table}')`)
  }
  expect(route).toContain(".eq('org_id', context.organizationId)")
  expect(route).toContain('amount_cents')

  const page = source('src/app/org/page.tsx')
  expect(page).toContain("fetch('/api/org/overview'")
  expect(page).not.toContain(".from('orders')")
  expect(page).not.toContain(".eq('role', 'coach')")
  expect(page).toContain("channel(`org-overview:${orgId}`)")
})

test('org workspace selection is exact and shared with mobile', () => {
  const active = source('src/app/api/roles/active/route.ts')
  expect(active).toContain('requestedWorkspaceId')
  expect(active).toContain('item.workspace_id === requestedWorkspaceId')
  expect(active).toContain("rpc('set_active_workspace'")

  const clientContext = source('src/lib/clientOrganization.ts')
  expect(clientContext).toContain("rpc('available_workspaces')")
  expect(clientContext).toContain('current_org_id')
})

test('primary org screens no longer infer one org from maybeSingle membership', () => {
  for (const page of ['teams', 'coaches', 'calendar', 'payments', 'contacts', 'reports', 'settings', 'permissions']) {
    const contents = source(`src/app/org/${page}/page.tsx`)
    expect(contents).toContain('getActiveOrganizationId')
  }
})

test('web profile switcher uses every iOS-authorized context and persists exact selections', () => {
  const roles = source('src/app/api/roles/available/route.ts')
  for (const rpc of ['available_workspaces', 'my_league_contexts', 'my_accessible_athlete_profiles', 'my_coach_team_contexts']) {
    expect(roles).toContain(`rpc('${rpc}')`)
  }

  const active = source('src/app/api/workspaces/active/route.ts')
  expect(active).toContain("rpc('set_active_workspace'")
  expect(active).toContain('athlete_profile_id')
  expect(active).toContain('coach_team_id')
  expect(active).toContain('selected_athlete_profile_id')
  expect(active).toContain('selected_coach_team_id')

  const choices = source('src/lib/portalChoices.ts')
  for (const portal of ["portal: 'org'", "portal: 'coach'", "portal: 'athlete'", "portal: 'league'"]) {
    expect(choices).toContain(portal)
  }
  expect(source('src/components/PublicHeader.tsx')).toContain('buildPortalChoices')
  expect(source('src/app/workspace/page.tsx')).toContain('buildPortalChoices')
})

test('coach records honor the active organization and team context', () => {
  const context = source('src/lib/activeCoachContext.ts')
  expect(context).toContain("from('active_workspace_preferences')")
  expect(context).toContain("from('workspace_memberships')")
  expect(context).toContain("from('org_team_coaches')")

  const sessions = source('src/app/api/sessions/route.ts')
  expect(sessions).toContain('resolveActiveCoachContext')
  expect(sessions).toContain("query.eq('org_id', context.organizationId)")
  expect(sessions).toContain("query.eq('team_id', context.teamId)")

  const games = source('src/app/api/coach/org-games/route.ts')
  expect(games).toContain('resolveActiveCoachContext')
  expect(games).toContain(".eq('org_id', context.organizationId)")
})

test('portal navigation is filtered by server-authoritative capabilities', () => {
  const endpoint = source('src/app/api/capabilities/route.ts')
  expect(endpoint).toContain('resolvePortalCapabilities')
  for (const sidebar of ['CoachSidebar', 'AthleteSidebar', 'OrgSidebar', 'LeagueNav']) {
    expect(source(`src/components/${sidebar}.tsx`)).toContain('usePortalCapabilities')
  }
})
