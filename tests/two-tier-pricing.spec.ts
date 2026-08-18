import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateOrgPlatformFee } from '../src/lib/orgPlatformFees'

test('public pricing exposes only coach and organization subscriptions', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/pricing/page.tsx'), 'utf8')
  expect(source).toContain('Individual Coach Plan')
  expect(source).toContain('Organization Plan')
  expect(source).toContain('4% Coaches Hive platform fee')
  expect(source).not.toContain('Family All Access')
  expect(source).not.toContain('Organization Starter')
  expect(source).not.toContain('Organization Growth')
  expect(source).not.toContain('$49')
})

test('platform fee rounds at four percent by default', () => {
  expect(calculateOrgPlatformFee({ amountCents: 12345, kind: 'session' }).platformFeeCents).toBe(494)
})

test('manual founding rate changes transaction fees independently', () => {
  const fee = calculateOrgPlatformFee({ amountCents: 12345, kind: 'marketplace', processingFeeRate: 0.03 })
  expect(fee.platformFeeCents).toBe(370)
  expect(fee.feeRate).toBe(3)
})
