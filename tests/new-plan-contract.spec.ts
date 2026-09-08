import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateOrgPlatformFee, PLATFORM_FEE_BPS } from '../src/lib/orgPlatformFees'
import { getAllAccessPriceKeys } from '../src/lib/allAccessPricing'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('new signup, billing, and entitlement contract', () => {
  test('presents all three signup paths and keeps invited access subscription-free', () => {
    const signup = read('src/app/signup/page.tsx')
    expect(signup).toContain('I run one team')
    expect(signup).toContain('I manage an organization or league')
    expect(signup).toContain("I&apos;m joining as an athlete or guardian")
    expect(signup).toContain('do not need to purchase this plan')
  })

  test('maps monthly and annual checkout prices only on the server', () => {
    expect(getAllAccessPriceKeys('coach', 'month')).toEqual(['STRIPE_PRICE_TEAM_STARTER_MONTHLY'])
    expect(getAllAccessPriceKeys('coach', 'year')).toEqual(['STRIPE_PRICE_TEAM_STARTER_ANNUAL'])
    expect(getAllAccessPriceKeys('org', 'month', 'growing_organization')).toEqual(['STRIPE_PRICE_GROWING_ORGANIZATION_MONTHLY'])
    expect(getAllAccessPriceKeys('org', 'year', 'established_organization')).toEqual(['STRIPE_PRICE_ESTABLISHED_ORGANIZATION_ANNUAL'])
    expect(read('src/app/api/mobile/subscription/start/route.ts')).toContain('plan.role !== actor.role')
  })

  test('calculates the configured platform fee in integer cents', () => {
    expect(PLATFORM_FEE_BPS).toBe(400)
    expect(calculateOrgPlatformFee({ amountCents: 10001, kind: 'org_fee' }).platformFeeCents).toBe(400)
  })

  test('enforces team and staff limits in the database without deleting data', () => {
    const migration = read('supabase/migrations/20260907000000_plan_catalog_and_entitlement_limits.sql')
    expect(migration).toContain('enforce_org_team_limit_trigger')
    expect(migration).toContain('enforce_org_staff_limit_trigger')
    expect(migration).not.toMatch(/delete from public\.(org_teams|organization_memberships)/)
  })
})
