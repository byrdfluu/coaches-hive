import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(file, 'utf8')

test('coach saved athletes use the native shared table and owner policy', () => {
  const route = read('src/app/api/coach/saved-athletes/route.ts')
  const migration = read('supabase/migrations/20261011040000_coach_saved_athletes_parity.sql')
  expect(route).toContain("getSessionRole(['coach'])")
  expect(route).toContain("from('coach_saved_athletes')")
  expect(route).toContain("onConflict: 'coach_id,athlete_id'")
  expect(migration).toContain('unique (coach_id, athlete_id)')
  expect(migration).toContain('coach_id = auth.uid()')
})

test('web coach roster reads native saves and profile can add or remove them', () => {
  const roster = read('src/app/coach/athletes/page.tsx')
  const profile = read('src/app/coach/athletes/[slug]/page.tsx')
  expect(roster).toContain("fetch('/api/coach/saved-athletes'")
  expect(roster).toContain("label: 'Saved athlete'")
  expect(profile).toContain('/api/coach/saved-athletes?athlete_id=')
  expect(profile).toContain("method: isSaved ? 'DELETE' : 'POST'")
  expect(profile).toContain("body: JSON.stringify({ athlete_id: athleteProfileId })")
})
