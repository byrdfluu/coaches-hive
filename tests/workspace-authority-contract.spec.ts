import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { workspaceCan, workspaceTenantInputMatches, type WorkspaceContext } from '@/lib/workspaceAuthority'

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('workspace authority uses only X-Workspace-ID and validates body tenant assertions', () => {
  const helper = source('src/lib/workspaceAuthority.ts')
  expect(helper).toContain("headers.get('x-workspace-id')")
  expect(helper).toContain('loadWorkspaceContext(workspaceId)')
  expect(helper).toContain('requireWorkspaceContext(input.userId, workspaceId)')
  expect(helper).toContain("code: 'workspace_context_mismatch'")
  expect(helper).toContain('workspaceTenantInputMatches(loaded, input.body)')
  expect(helper).not.toContain("from('active_workspace_preferences')")
})

test('tenant assertions support organization, league, independent coach, casing, and cross-tenant rejection', () => {
  const base = { roles: ['org_admin', 'program_director'], permissions: { manage_members: true }, ownerUserId: null }
  const organization: WorkspaceContext = { ...base, id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', type: 'organization',
    organizationId: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', leagueId: null }
  const league: WorkspaceContext = { ...base, id: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC', type: 'league',
    organizationId: null, leagueId: 'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD' }
  const coach: WorkspaceContext = { ...base, id: 'EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE', type: 'independent_coach',
    organizationId: null, leagueId: null, ownerUserId: 'user-1', roles: ['owner', 'coach'] }
  expect(workspaceTenantInputMatches(organization, { workspace_id: organization.id.toLowerCase(), org_id: organization.organizationId?.toLowerCase() })).toBe(true)
  expect(workspaceTenantInputMatches(league, { workspace_id: league.id, league_id: league.leagueId })).toBe(true)
  expect(workspaceTenantInputMatches(coach, { workspace_id: coach.id })).toBe(true)
  expect(workspaceTenantInputMatches(organization, { organization_id: league.leagueId })).toBe(false)
  expect(workspaceTenantInputMatches(league, { league_id: organization.organizationId })).toBe(false)
  expect(workspaceCan(organization, 'manage_members')).toBe(true)
})

test('critical workspace routes use the shared authority boundary', () => {
  for (const file of [
    'src/app/api/org/invites/route.ts',
    'src/app/api/invites/athlete/route.ts',
    'src/app/api/mobile/invitations/route.ts',
    'src/app/api/mobile/subscription/start/route.ts',
    'src/app/api/mobile/subscription/status/route.ts',
    'src/app/api/mobile/billing-portal/route.ts',
    'src/app/api/mobile/connect/start/route.ts',
  ]) {
    expect(source(file), file).toContain('authorizeWorkspaceRequest')
    expect(source(file), file).toContain('logWorkspaceAuthority')
  }
})

test('organization invites derive organization ownership from the authorized workspace', () => {
  const route = source('src/app/api/org/invites/route.ts')
  expect(route).toContain("expectedType: 'organization'")
  expect(route).toContain('const orgId = workspace.organizationId')
  expect(route).toContain(".eq('org_id', authoritativeOrg.id)")
  expect(route).toContain(".eq('org_id', orgId)")
})

test('workspace consistency audit is read-only and covers tenant mismatch classes', () => {
  const audit = source('supabase/workspace_context_consistency_audit.sql')
  expect(audit).toContain('active_workspace_preference_missing_workspace')
  expect(audit).toContain('workspace_membership_missing_workspace')
  expect(audit).toContain('duplicate_organization_workspaces')
  expect(audit).toContain('platform_subscription_workspace_org_mismatch')
  expect(audit).toContain('stripe_connect_workspace_org_mismatch')
  expect(audit).toContain('org_invite_workspace_org_mismatch')
  expect(audit).not.toMatch(/\b(update|delete|insert)\b/i)
})
