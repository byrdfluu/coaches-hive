import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('selected athlete context is restored from and saved to server state', () => {
  const context = source('src/components/AthleteProfileContext.tsx')
  const roles = source('src/app/api/roles/available/route.ts')
  const activeWorkspace = source('src/app/api/workspaces/active/route.ts')

  expect(context).toContain("fetch('/api/roles/available', { cache: 'no-store' })")
  expect(context).toContain("fetch('/api/workspaces/active'")
  expect(context).toContain('athlete_profile_id: id')
  expect(roles).toContain('selected_athlete_profile_id: session.user.user_metadata?.selected_athlete_profile_id')
  expect(activeWorkspace).toContain('selected_athlete_profile_id: athleteProfileId')
})

test('every marketplace surface hydrates and writes the authenticated server cart', () => {
  const paths = [
    'src/app/athlete/marketplace/page.tsx',
    'src/app/athlete/marketplace/cart/page.tsx',
    'src/app/athlete/marketplace/product/[id]/page.tsx',
  ]

  for (const path of paths) {
    const page = source(path)
    expect(page).toContain("fetch('/api/athlete/cart'")
    expect(page).toContain("method: 'POST'")
    expect(page).toContain('cartHydrated')
  }
  expect(source('src/app/api/athlete/cart/route.ts')).toContain(".update({ cart: sanitizedCart })")
})

test('marketplace preferences and onboarding progress have durable read and write paths', () => {
  const marketplace = source('src/app/athlete/marketplace/page.tsx')
  const onboarding = source('src/components/SharedOnboardingFlow.tsx')

  expect(marketplace).toContain("fetch('/api/athlete/marketplace-preferences')")
  expect(marketplace).toContain('preferencesHydrated')
  expect(onboarding).toContain("fetch('/api/onboarding/profile', { cache: 'no-store' })")
  expect(onboarding).toContain('last_step_id: options.lastStepId')
})
