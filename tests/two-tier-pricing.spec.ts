import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateOrgPlatformFee } from '../src/lib/orgPlatformFees'

test('public pricing exposes the approved team-scaled plans and free athlete access disclosure', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/pricing/page.tsx'), 'utf8')
  for (const key of ['team_starter', 'growing_organization', 'established_organization', 'league_enterprise']) expect(source).toContain(`key: '${key}'`)
  for (const price of ['monthly: 49', 'monthly: 129', 'monthly: 249', 'monthly: 499']) expect(source).toContain(price)
  expect(source).toContain('Athlete and guardian access is included')
  expect(source).toContain('4%')
  expect(source).toContain('platform fee<br />for payments processed')
  expect(source).toContain('Annual')
  expect(source).toContain('Save 2 months')
})

test('platform fee rounds at four percent by default', () => {
  expect(calculateOrgPlatformFee({ amountCents: 12345, kind: 'session' }).platformFeeCents).toBe(494)
})

test('manual founding rate changes transaction fees independently', () => {
  const fee = calculateOrgPlatformFee({ amountCents: 12345, kind: 'marketplace', processingFeeRate: 0.03 })
  expect(fee.platformFeeCents).toBe(370)
  expect(fee.feeRate).toBe(3)
})
