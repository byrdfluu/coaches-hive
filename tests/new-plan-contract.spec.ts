import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateOrgPlatformFee, PLATFORM_FEE_BPS } from '../src/lib/orgPlatformFees'
import { getAllAccessPriceKeys } from '../src/lib/allAccessPricing'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('new signup, billing, and entitlement contract', () => {
  test('hands web signup to the app while preserving signup context', () => {
    const signup = read('src/app/signup/page.tsx')
    expect(signup).toContain("reason: 'web_signup_paused'")
    expect(signup).toContain('Object.entries(incoming)')
    expect(signup).toContain('redirect(`/open-app?')
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

  test('enforces four percent across legacy organization, facility, membership, and admin paths', () => {
    const migration = read('supabase/migrations/20260919030000_enforce_four_percent_platform_fee.sql')
    const facilities = read('src/app/api/facilities/route.ts')
    const mobileFacilities = read('src/app/api/mobile/facilities/route.ts')
    const canonical = read('src/lib/canonicalPaymentIntent.ts')
    const memberships = read('src/app/api/athlete/coach-memberships/checkout/route.ts')
    const adminTryouts = read('src/app/admin/tryouts/page.tsx')
    expect(migration).toContain('check (processing_fee_rate = 0.04)')
    expect(migration).toContain('check (marketplace_fee_rate = 0.04)')
    expect(facilities).not.toContain('body.marketplace_fee_rate')
    expect(mobileFacilities).toContain('marketplace_fee_rate:0.04')
    expect(canonical).not.toContain('facilityFeeRate')
    expect(memberships).toContain('MARKETPLACE_PLATFORM_FEE_PERCENT')
    expect(adminTryouts).not.toContain('Platform fee (4%)')
    expect(read('src/app/org/payments/page.tsx')).not.toContain('is applied to each payment')
    expect(read('src/app/org/settings/page.tsx')).toContain('4% platform fee on payments processed.')
  })

  test('enforces team and staff limits in the database without deleting data', () => {
    const migration = read('supabase/migrations/20260907000000_plan_catalog_and_entitlement_limits.sql')
    expect(migration).toContain('enforce_org_team_limit_trigger')
    expect(migration).toContain('enforce_org_staff_limit_trigger')
    expect(migration).not.toMatch(/delete from public\.(org_teams|organization_memberships)/)
  })
})
