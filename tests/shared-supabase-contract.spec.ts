import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('web is pinned to the same Supabase project as iOS', () => {
  const project = source('src/lib/supabaseProject.ts')
  expect(project).toContain("fxmxrzhucccneoibksny")
  for (const path of ['src/lib/supabaseClient.ts', 'src/lib/supabaseAdmin.ts', 'src/middleware.ts']) {
    expect(source(path)).toContain('assertCoachesHiveSupabaseProject')
  }
})

test('authoritative workspace RPC boundaries use generated production database types', () => {
  const database = source('src/types/database.ts')
  expect(database).toContain('export type Database =')
  expect(database).toContain('available_workspaces:')
  expect(database).toContain('my_league_contexts:')
  expect(database).toContain('payment_transactions:')
  const boundary = source('src/lib/sharedSupabaseContract.ts')
  expect(boundary).toContain("@/types/database")
  expect(boundary).toContain("Database['public']['Functions']['available_workspaces']")
  for (const path of ['src/app/api/roles/available/route.ts','src/app/api/workspaces/active/route.ts','src/app/api/league/context/route.ts'])
    expect(source(path)).toContain('asSharedSupabaseClient')
})

test('workspace selection uses the same server-authoritative RPCs as iOS', () => {
  const available = source('src/app/api/roles/available/route.ts')
  const active = source('src/app/api/workspaces/active/route.ts')
  const league = source('src/app/api/league/context/route.ts')
  expect(available).toContain("rpc('available_workspaces')")
  expect(available).toContain("rpc('my_league_contexts')")
  expect(active).toContain("rpc('set_active_workspace'")
  expect(league).toContain("rpc('my_league_contexts')")
  expect(active).not.toContain("from('active_workspace_preferences').upsert")
})

test('current iOS league, family, messaging, reports, discovery, and governance migrations are shared', () => {
  for (const migration of [
    '20260908090000_group_message_threads.sql',
    '20260908210000_season_scoped_org_reports.sql',
    '20260909010000_league_foundation_up_to_35_teams.sql',
    '20260909020000_family_authorized_athlete_profiles.sql',
    '20260909030000_league_access_roles_and_invitations.sql',
    '20260909040000_parent_athlete_portal_and_guardian_invites.sql',
    '20260911010000_safe_public_discovery.sql',
    '20260912010000_superadmin_league_and_platform_health.sql',
  ]) expect(source(`supabase/migrations/${migration}`).length).toBeGreaterThan(100)
})
