import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pricing = () => readFileSync(resolve(process.cwd(), 'src/app/pricing/page.tsx'), 'utf8')

test('organization Starter and Growth publish distinct approved feature lists', () => {
  const source = pricing()
  for (const copy of [
    'Up to 5 coaches and 50 athletes',
    'Digital waivers and required forms',
    'Basic document assignment and completion tracking',
    'Up to 20 coaches and 250 athletes',
    'Advanced workspace roles and permissions',
    'Advanced reports, trends, and CSV exports',
    'Up to 20 active marketplace products',
  ]) expect(source).toContain(copy)
  expect(source).not.toContain('Unlimited athletes, parents, and guardians')
})

test('both organization plans display payment terms and independent-business coverage language', () => {
  const source = pricing()
  expect(source).toContain('Program registrations: 7% platform fee')
  expect(source).toContain('currently 2.9% + 30¢')
  expect(source).toContain('10% platform fee, capped at $75 per transaction')
  expect(source).not.toContain("'Payments managed through Coaches Hive must use Coaches Hive Payments',")
  expect(source).not.toContain('Stripe processing is included in the displayed transaction breakdown')
  expect(source).toContain('A separate Coach All Access subscription is only required for an independently operated coaching business.')
})
