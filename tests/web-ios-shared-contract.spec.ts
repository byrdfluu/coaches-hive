import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('identity, workspace, league, coach-team, and family contexts use shared RPCs', () => {
  const service = read('src/lib/authorizedContexts.ts')
  for (const rpc of ['available_workspaces', 'my_league_contexts', 'my_coach_team_contexts', 'my_accessible_athlete_profiles']) {
    expect(service).toContain(`rpc('${rpc}')`)
  }
  expect(read('src/app/api/roles/active/route.ts')).toContain("rpc('set_active_workspace'")
})

test('messaging and paperwork actions use server-authoritative shared functions', () => {
  expect(read('src/app/api/messages/group/route.ts')).toContain("rpc('create_group_thread'")
  expect(read('src/app/api/messages/audiences/route.ts')).toContain("rpc('message_program_audiences'")
  const paperwork = read('src/app/api/org/paperwork/actions/route.ts')
  expect(paperwork).toContain("rpc('send_paperwork_reminders'")
  expect(paperwork).toContain("rpc('archive_paperwork'")
})

test('shared private document storage and production release gates are explicit', () => {
  expect(read('src/app/api/storage/setup/route.ts')).toContain("ensureBucket('org-documents', false)")
  const gate = read('docs/shared-supabase-release-gate.md')
  expect(gate).toMatch(/athlete\s+profiles remain non-public/)
  expect(gate).toContain('signed-webhook-only')
  expect(gate).toContain('integer cents')
  expect(gate).toContain('has an identical remote version')
})
