import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('the original site typography is bundled and assigned consistently', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

  for (const weight of [400, 500, 600, 700]) {
    const relativePath = `public/fonts/space-grotesk-${weight}.ttf`
    expect(existsSync(resolve(process.cwd(), relativePath))).toBe(true)
    expect(css).toContain(`url('/fonts/space-grotesk-${weight}.ttf')`)
    expect(css).toContain(`font-weight: ${weight}`)
  }

  expect(css).toContain("--font-sans: 'Space Grotesk'")
  expect(css).toContain("--public-font-family: 'Space Grotesk'")
  expect(css).toContain("--font-display: 'League Gothic'")
  expect(css).toContain("--font-brand: 'Barlow Condensed Sport'")
  expect(css).toContain("font-family: var(--font-sans)")
  expect(css).toContain("font-family: var(--font-display) !important")
  expect(css).toContain("font-family: var(--font-brand)")
})
