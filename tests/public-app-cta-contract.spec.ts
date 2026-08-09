import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('public trial CTAs are replaced by the shared app-download CTA', () => {
  const publicSources = [
    source('src/app/page.tsx'),
    source('src/app/platform-preview/page.tsx'),
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

test('retired audience landing pages redirect into the consolidated homepage', () => {
  expect(source('src/app/organizations/page.tsx')).toContain("redirect('/#organizations')")
  expect(source('src/app/coaches/page.tsx')).toContain("redirect('/#coaches')")
  expect(source('src/app/athletes/page.tsx')).toContain("redirect('/#athletes')")
  expect(source('src/app/coach/page.tsx')).toContain("redirect('/#coaches')")
  expect(source('src/app/athlete/page.tsx')).toContain("redirect('/#athletes')")
  const home = source('src/app/page.tsx')
  expect(home).toContain('One platform. Three connected experiences.')
  expect(home).toContain("id: 'organizations'")
  expect(home).toContain("id: 'coaches'")
  expect(home).toContain("id: 'athletes'")
})
