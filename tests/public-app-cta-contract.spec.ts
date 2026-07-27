import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('public trial CTAs are replaced by the shared app-download CTA', () => {
  const publicSources = [
    source('src/app/page.tsx'),
    source('src/app/organizations/page.tsx'),
    source('src/app/platform-preview/page.tsx'),
    source('src/app/coaches/page.tsx'),
    source('src/app/athletes/page.tsx'),
    source('src/app/coach/page.tsx'),
    source('src/app/athlete/page.tsx'),
    source('src/app/pricing/page.tsx'),
    source('src/components/PublicHeader.tsx'),
  ]

  for (const content of publicSources) {
    expect(content.toLowerCase()).not.toContain('start free trial')
    expect(content).toContain('GetTheAppButton')
  }
})

test('pricing trial CTA opens the app-download modal instead of web signup or checkout', () => {
  const pricing = source('src/app/pricing/page.tsx')

  expect(pricing).toContain('label={`Start ${selected.trialDays}-day free trial`}')
  expect(pricing).toContain('GetTheAppButton')
  expect(pricing).not.toContain('href={checkoutHref}')
  expect(pricing).not.toContain('/signup?role=')
  expect(pricing).not.toContain('createClientComponentClient')
})

test('coach and athlete acquisition CTAs use the app-download modal', () => {
  const coaches = source('src/app/coaches/page.tsx')
  const athletes = source('src/app/athletes/page.tsx')
  const legacyCoach = source('src/app/coach/page.tsx')
  const legacyAthlete = source('src/app/athlete/page.tsx')

  expect(coaches).toContain('label="Create coach profile"')
  expect(legacyCoach).toContain('label="Create coach profile"')
  expect(athletes).toContain('label="Find a coach"')
  expect(legacyAthlete).toContain('label="Find a coach"')

  for (const content of [athletes, legacyAthlete]) {
    expect(content).not.toContain('Explore marketplace')
    expect(content).not.toContain('href="/athlete/marketplace"')
  }

  for (const content of [coaches, athletes, legacyCoach, legacyAthlete]) {
    expect(content).not.toContain('href="/signup"')
  }
})
