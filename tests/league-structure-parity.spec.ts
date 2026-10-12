import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosSource = (path: string) => readFileSync(resolve('/Users/juwan/Desktop/CH App', path), 'utf8')

test('web exposes the league structure mutations available on iOS', () => {
  const api = source('src/app/api/league/data/route.ts')
  const page = source('src/app/league/[section]/page.tsx')
  const ios = [
    iosSource('CH App/LeaguePortal/Structure/LeagueOrganizationsView.swift'),
    iosSource('CH App/LeaguePortal/Structure/LeagueDivisionsView.swift'),
    iosSource('CH App/LeaguePortal/Seasons/LeagueSeasonsView.swift'),
    iosSource('CH App/LeaguePortal/Schedule/LeagueGameEditorView.swift'),
  ].join('\n')

  for (const action of [
    'add_organization', 'remove_organization', 'create_division', 'update_division',
    'delete_division', 'reassign_team_division', 'assign_team', 'remove_team',
    'create_season', 'update_season', 'set_active_season', 'save_game',
  ]) {
    expect(api).toContain(`action==='${action}'`)
    expect(page).toContain(`'${action}'`)
  }
  for (const table of ['league_organizations', 'league_divisions', 'league_team_assignments', 'league_seasons', 'league_games']) {
    expect(api).toContain(`from('${table}')`)
    expect(ios).toContain(`from("${table}")`)
  }
})

test('league management migration carries the shared RPC and result contracts', () => {
  const migration = source('supabase/migrations/20261012040000_league_management_action_parity.sql')
  for (const rpc of ['add_organization_to_league', 'league_set_active_season', 'approve_league_game_result']) {
    expect(migration).toContain(`function public.${rpc}`)
    expect(migration.split(`public.${rpc}(`).length).toBeGreaterThan(2)
  }
  expect(migration).toContain('grant execute on function public.org_has_active_subscription')
  for (const field of ['ends_at', 'result_status', 'result_type', 'submitted_for_team_id', 'approved_by', 'approved_at']) {
    expect(migration).toContain(`add column if not exists ${field}`)
  }
  expect(migration).toContain("status='final'")
  expect(source('src/app/api/league/data/route.ts')).not.toContain("status:'completed'")
})

test('league structure writes reject unauthenticated requests', async ({ request }) => {
  for (const action of ['add_organization', 'assign_team', 'set_active_season', 'save_game']) {
    const response = await request.post('/api/league/data', { data: { action } })
    expect(response.status()).toBe(401)
  }
})
