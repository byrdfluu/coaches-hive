import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('coach profiles remain public while athlete profiles are never public', () => {
  const routing = source('src/lib/appFirstRouting.ts')
  const middleware = source('src/middleware.ts')
  expect(routing).toContain('isPublicAthleteProfilePath')
  expect(routing).toContain('isPublicAthleteProfilePath = (pathname: string) =>\n  false')
  expect(middleware).toContain("pathname.startsWith('/athlete/') && !isAthletePublicProfilePage")

  const coachRoute = source('src/app/api/public/coaches/route.ts')
  expect(coachRoute).toContain('isUuid(slug)')
  expect(coachRoute).toContain('profile.id === slug')

  const orgRoute = source('src/app/api/org/public/route.ts')
  expect(orgRoute).toContain('isUuid(identifier)')
  expect(orgRoute).toContain(".eq('id', identifier)")
})
test('public athlete profile always returns not found without querying identity data', () => {
  const page = source('src/app/athlete/[id]/page.tsx')
  expect(page).toContain('notFound()')
  expect(page).not.toContain('supabaseAdmin')
  expect(page).not.toContain("from('athlete_profiles')")
})

test('public coach API removes internal settings from its response', () => {
  const route = source('src/app/api/public/coaches/route.ts')
  expect(route).toContain('coach_profile_settings: { media: legacyMedia }')
  expect(route).toContain('coach_privacy_settings: {')
  expect(route).not.toContain("'integration_settings',")
  expect(route).not.toContain("'coach_auto_reply',")
  expect(route).not.toContain('blockedAthletes: privacy.blockedAthletes')
})
