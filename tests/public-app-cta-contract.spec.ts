import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('public trial CTAs are replaced by the shared app-download CTA', () => {
  const publicSources = [
    source('src/app/page.tsx'),
    source('src/app/organizations/page.tsx'),
    source('src/app/platform-preview/page.tsx'),
    source('src/components/PublicHeader.tsx'),
  ]

  for (const content of publicSources) {
    expect(content.toLowerCase()).not.toContain('start free trial')
    expect(content).toContain('GetTheAppButton')
  }
})
