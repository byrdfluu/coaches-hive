import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(path, 'utf8')

test('org overview is server-authoritative and workspace scoped', () => {
  const route = source('src/app/api/org/overview/route.ts')
  expect(route).toContain('resolveActiveOrganization')
  for (const table of ['org_settings', 'org_teams', 'organization_memberships', 'athlete_organization_memberships', 'sessions', 'org_fee_assignments']) {
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
  expect(active.indexOf('if (athleteProfileId)')).toBeLessThan(active.indexOf("rpc('available_workspaces')"))

  const choices = source('src/lib/portalChoices.ts')
  for (const portal of ["portal: 'org'", "portal: 'coach'", "portal: 'athlete'", "portal: 'league'"]) {
    expect(choices).toContain(portal)
  }
  expect(choices).toContain('for (const athlete of personaAthletes)')
  expect(choices).toContain("id: `athlete:${athlete.id}`")
  expect(choices).toContain('for (const team of assignedTeams)')
  expect(choices).toContain('payload.is_protected_owner')
  expect(choices).toContain('!athlete.owned_by_current_user')
  expect(roles).toContain("roles.add('athlete')")
  expect(roles).toContain("profile.status === 'active'")
  expect(roles).toContain("'Cache-Control': 'private, no-store, max-age=0'")
  expect(source('src/components/PublicHeader.tsx')).toContain('buildPortalChoices')
  expect(source('src/app/workspace/page.tsx')).toContain('buildPortalChoices')
})

test('coach records honor the active organization and team context', () => {
  const context = source('src/lib/activeCoachContext.ts')
  expect(context).toContain("from('active_workspace_preferences')")
  expect(context).toContain("from('workspace_memberships')")
  expect(context).toContain("from('org_team_coaches')")
  expect(context).toContain('preference?.workspace_id || metadata.active_workspace_id')

  const sessions = source('src/app/api/sessions/route.ts')
  expect(sessions).toContain('resolveActiveCoachContext')
  expect(sessions).toContain("query.eq('org_id', context.organizationId)")
  expect(sessions).toContain("query.eq('team_id', context.teamId)")
  expect(sessions).toContain('resolveAuthorizedAthleteContext')
  expect(sessions).toContain('athlete_id.eq.${athleteContext.profileId}')

  const games = source('src/app/api/coach/org-games/route.ts')
  expect(games).toContain('resolveActiveCoachContext')
  expect(games).toContain(".eq('org_id', context.organizationId)")

  const roster = source('src/app/api/memberships/route.ts')
  expect(roster).toContain('resolveActiveCoachContext')
  expect(roster).toContain("from('org_team_coaches')")
  expect(roster).toContain("from('org_team_members')")
  expect(roster).toContain("from('athlete_profiles')")
  expect(roster).toContain('athlete_owner_user_id')

  const athleteDetail = source('src/app/api/athletes/[id]/profile/route.ts')
  expect(athleteDetail).toContain('resolveActiveCoachContext')
  expect(athleteDetail).toContain('Athlete not available in the selected workspace')

  const payments = source('src/app/api/coach/payment-summary/route.ts')
  expect(payments).toContain('resolveAuthorizedCoachAthleteProfileIds')
  expect(payments).toContain('resolveActiveCoachContext')
  expect(payments).toContain(".eq('org_id', context.organizationId)")
  expect(payments).toContain('charged_cents')

  const reports = source('src/app/api/coach/reports/route.ts')
  expect(reports).toContain('resolveActiveCoachContext')
  expect(reports).toContain("eq('workspace_id', context.workspaceId)")
  expect(source('src/app/coach/reports/page.tsx')).toContain("fetch('/api/coach/reports'")

  const notes = source('src/app/api/coach/notes/route.ts')
  expect(notes).toContain('resolveAuthorizedCoachAthleteProfileIds')
  expect(notes).toContain('athlete_id: athleteId')
  expect(notes).toContain('workspace_id: context.workspaceId')
  expect(notes).not.toContain("select('id, type, athlete, team")

  const inbox = source('src/app/api/messages/inbox/route.ts')
  expect(inbox).toContain('resolveActiveCoachContext')
  expect(inbox).toContain("threadsQuery.eq('org_id', context.organizationId)")
  const orgTeamMessages = source('src/app/api/messages/org-team/route.ts')
  expect(orgTeamMessages).toContain('resolveActiveOrganizationForUser')
  expect(orgTeamMessages).toContain('org_id: team.org_id')
  expect(orgTeamMessages).toContain("from('athlete_profiles').select('id,owner_user_id')")
  const directThread = source('src/app/api/messages/thread/route.ts')
  expect(directThread).toContain('resolveAuthorizedCoachAthleteProfileIds')
  expect(directThread).toContain('Recipient is not available in the selected coach workspace.')

  const orders = source('src/app/api/coach/orders/route.ts')
  expect(orders).toContain('resolveActiveCoachContext')
  expect(orders).toContain("canonicalQuery.eq('workspace_id', context.workspaceId)")
  expect(source('src/app/api/coach/reviews/route.ts')).toContain('resolveAuthorizedCoachAthleteProfileIds')
  expect(source('src/app/coach/marketplace/revenue/page.tsx')).toContain("fetch('/api/coach/orders'")
  expect(source('src/app/coach/marketplace/page.tsx')).toContain("fetch('/api/coach/context'")
  expect(source('src/app/coach/bookings/page.tsx')).toContain("fetch('/api/sessions'")
  const bookings = source('src/app/api/bookings/route.ts')
  expect(bookings).toContain('workspace_id: workspaceId')
  expect(bookings).toContain('team_id: teamId')
  expect(bookings).toContain('Coach is not assigned to the active organization workspace.')

  const coachDocuments = source('src/app/api/coach/documents/route.ts')
  expect(coachDocuments).toContain('resolveActiveCoachContext')
  expect(coachDocuments).toContain("from('coach_document_requests')")
  expect(coachDocuments).toContain("from('coach_document_submissions')")
  expect(coachDocuments).toContain("from('org-documents')")

  const orgDocuments = source('src/app/api/org/coach-documents/route.ts')
  expect(orgDocuments).toContain('resolveActiveOrganizationForUser')
  expect(orgDocuments).toContain("rpc('review_coach_document_request'")

  const plans = source('src/app/api/training-plans/route.ts')
  expect(plans).toContain('resolveAuthorizedCoachAthleteProfileIds')
  expect(plans).toContain('resolveAuthorizedAthleteContext')
  expect(plans).toContain('Plan not found in the selected workspace')
})

test('portal navigation is filtered by server-authoritative capabilities', () => {
  const endpoint = source('src/app/api/capabilities/route.ts')
  expect(endpoint).toContain('resolvePortalCapabilities')
  expect(endpoint).toContain("from('active_workspace_preferences')")
  expect(endpoint).not.toContain("user_metadata?.active_workspace_id")
  for (const sidebar of ['CoachSidebar', 'AthleteSidebar', 'OrgSidebar', 'LeagueNav']) {
    expect(source(`src/components/${sidebar}.tsx`)).toContain('usePortalCapabilities')
  }
})

test('athlete portal data follows the exact authorized athlete persona', () => {
  const resolver = source('src/lib/authorizedAthleteContext.ts')
  expect(resolver).toContain("from('athlete_profiles')")
  expect(resolver).toContain("from('family_members')")
  expect(resolver).toContain(".eq('status', 'active')")

  for (const route of ['profile', 'charges', 'payments-summary', 'notes', 'metrics', 'org-games']) {
    expect(source(`src/app/api/athlete/${route}/route.ts`)).toContain('resolveAuthorizedAthleteContext')
  }

  const payments = source('src/app/api/athlete/payments-summary/route.ts')
  expect(payments).toContain('matchingSessionIds')
  expect(payments).toContain('athleteContext.profileId')
  expect(payments).toContain('athleteContext.ownerUserId')

  const games = source('src/app/api/athlete/org-games/route.ts')
  expect(games).toContain("from('athlete_organization_memberships')")
  expect(games).toContain(".eq('athlete_id', athleteContext.profileId)")

  const waivers = source('src/app/api/waivers/pending/route.ts')
  expect(waivers).toContain("from('athlete_organization_memberships')")
  expect(waivers).toContain(".eq('athlete_id', athleteContext.profileId)")

  const programs = source('src/app/api/athlete/org-programs/route.ts')
  expect(programs).toContain("rpc('assigned_org_programs_for_athlete'")
  expect(programs).toContain("rpc('is_org_program_visible'")
  expect(programs).toContain("from('program_registrations')")
  expect(programs).toContain('resolveAuthorizedAthleteContext')
  const programsPage = source('src/app/athlete/programs/page.tsx')
  expect(programsPage).toContain('/api/athlete/org-programs')
  expect(programsPage).toContain("type: 'program'")
})
