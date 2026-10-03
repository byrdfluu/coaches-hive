import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261003030000_normalize_athlete_profile_state.sql'), 'utf8')

test('athlete profile state is normalized before its database constraint runs', () => {
  expect(migration).toContain('create or replace function public.canonical_us_state')
  expect(migration).toContain('before insert or update of state on public.athlete_profiles')
  expect(migration).toContain("when 'NORTHCAROLINA' then 'NC'")
  expect(migration).toContain("when 'NC' then 'NC'")
  expect(migration).toContain("when '' then null")
})

test('state normalization preserves the canonical two-letter constraint', () => {
  expect(migration).not.toContain('drop constraint if exists athlete_profiles_state_check')
  expect(migration).toContain("public.canonical_us_state(state) ~ '^[A-Z]{2}$'")
  expect(migration).toContain("notify pgrst, 'reload schema'")
})
