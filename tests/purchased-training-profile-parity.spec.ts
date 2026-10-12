import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('purchased programs resolve and filter the selected athlete persona', () => {
  const list = source('src/app/api/athlete/programs/route.ts')
  const detail = source('src/app/api/athlete/programs/[id]/route.ts')
  for (const route of [list, detail]) {
    expect(route).toContain('resolveAuthorizedAthleteContext')
    expect(route).toContain('athlete_profile_id.eq.${athlete.profileId}')
    expect(route).toContain("['paid', 'Paid', 'active', 'approved']")
  }
})

test('exercise history reads and writes the selected athlete profile', () => {
  const route = source('src/app/api/athlete/programs/[id]/log/route.ts')
  expect(route).toContain(".eq('athlete_profile_id', athlete.profileId)")
  expect(route).toContain('athlete_profile_id: athlete.profileId')
  expect(route).toContain('resolveAuthorizedAthleteContext')
})

test('web and mobile carry the same athlete profile through program requests', () => {
  const webList = source('src/app/athlete/programs/page.tsx')
  const webDetail = source('src/app/athlete/programs/[id]/page.tsx')
  expect(webList).toContain('/api/athlete/programs?athlete_profile_id=')
  expect(webDetail).toContain('athlete_profile_id: athleteProfileId')

  const migration = source('supabase/migrations/20261012010000_profile_scope_purchased_training.sql')
  expect(migration).toContain('alter table if exists public.orders')
  expect(migration).toContain('alter table if exists public.athlete_exercise_logs')
  expect(migration).toContain('public.owns_athlete_profile(athlete_profile_id)')
})

test('cart fulfillment preserves the receiving athlete profile', () => {
  const checkout = source('src/app/api/stripe/cart-checkout/route.ts')
  const webhook = source('src/app/api/stripe/webhook/route.ts')
  expect(checkout).toContain('athlete_profile_id: athleteSelection.athleteProfileId')
  expect(webhook).toContain('const athleteProfileId = metadata.athlete_profile_id || null')
  expect(webhook).toContain('athlete_profile_id: athleteProfileId')
})
