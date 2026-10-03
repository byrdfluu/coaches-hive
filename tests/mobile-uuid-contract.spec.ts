import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { isUuid, normalizeUuid, parseUuid } from '../src/lib/uuid'

const LOWER = 'd616bbbc-706e-4297-902a-0071cd68e1da'
const UPPER = LOWER.toUpperCase()

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('UUID parsing accepts iOS uppercase UUIDs and returns PostgreSQL canonical form', () => {
  expect(isUuid(UPPER)).toBe(true)
  expect(normalizeUuid(UPPER)).toBe(LOWER)
  expect(parseUuid(UPPER)).toBe(LOWER)
  expect(parseUuid(`  ${UPPER}  `)).toBe(LOWER)
})

test('UUID parsing rejects malformed identifiers before database or Stripe work', () => {
  expect(parseUuid('')).toBeNull()
  expect(parseUuid('not-a-uuid')).toBeNull()
  expect(parseUuid(`${LOWER}-extra`)).toBeNull()
})

test('mobile payment boundaries use the shared UUID parser', async () => {
  const routes = [
    '../src/app/api/mobile/checkout/route.ts',
    '../src/app/api/mobile/family/offerings/prepare/route.ts',
    '../src/app/api/mobile/family/storefront/route.ts',
    '../src/app/api/mobile/memberships/billing-portal/route.ts',
    '../src/app/api/mobile/offerings/recurring-checkout/route.ts',
    '../src/app/api/mobile/recurring-fees/billing-portal/route.ts',
    '../src/app/api/mobile/recurring-fees/start/route.ts',
    '../src/app/api/mobile/refunds/route.ts',
    '../src/app/api/mobile/training-packages/billing-portal/route.ts',
    '../src/app/api/mobile/training-packages/purchase/route.ts',
  ]
  for (const route of routes) {
    const routeSource = source(route.replace('../', ''))
    expect(routeSource, route).toContain('parseUuid')
  }
})

test('training checkout keeps athlete_profile_id canonical and athlete_id compatible', async () => {
  const routeSource = source('src/app/api/mobile/training-packages/purchase/route.ts')
  expect(routeSource).toContain('parseUuid(body.athlete_profile_id || body.athlete_id)')
  expect(routeSource).toContain("'invalid_request'")
})
