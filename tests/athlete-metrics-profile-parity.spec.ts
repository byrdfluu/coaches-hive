import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('athlete metric writes update the profile-scoped current value', () => {
  const route = source('src/app/api/athlete/metrics/route.ts')
  expect(route).toContain(".eq('athlete_profile_id', selection.profileId)")
  expect(route).toContain("from('athlete_metrics').update(currentValue)")
  expect(route).toContain("from('athlete_metrics').insert(currentValue)")
  expect(route).not.toContain("onConflict: 'athlete_id,label'")
})

test('coach metric access authorizes and filters by athlete profile', () => {
  const route = source('src/app/api/coach/athletes/[id]/metrics/route.ts')
  const page = source('src/app/coach/athletes/[slug]/page.tsx')
  expect(route).toContain('resolveAthleteProfile')
  expect(route).toContain(".eq('athlete_profile_id', athleteProfile.id)")
  expect(route).toContain("from('org_team_members')")
  expect(route).toContain("from('org_team_coaches')")
  expect(route).toContain("from('organization_memberships')")
  expect(page).toContain('?athlete_profile_id=${encodeURIComponent(profileId)}')
  expect(page).toContain('resolvedAthleteProfileIdRef.current')
})

test('coach CSV imports preserve the selected athlete profile', () => {
  const route = source('src/app/api/coach/athletes/[id]/metrics/import/route.ts')
  const page = source('src/app/coach/athletes/[slug]/page.tsx')
  expect(route).toContain('athlete_profile_id: athleteProfile?.id || null')
  expect(route).toContain(".eq('athlete_profile_id', athleteProfile.id)")
  expect(route).not.toContain("onConflict: 'athlete_id,label'")
  expect(page).toContain('body: JSON.stringify({ rows, athlete_profile_id: profileId })')
})
