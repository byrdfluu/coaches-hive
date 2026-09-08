import { expect, test } from '@playwright/test'
import { ALL_ACCESS_PRICING, getAllAccessPriceKeys, PLAN_CATALOG, normalizePlanKey } from '../src/lib/allAccessPricing'

test.describe('approved subscription pricing contract', () => {
  test('uses the approved recurring amounts', () => {
    expect(ALL_ACCESS_PRICING.coach).toEqual({ month: 4900, year: 49000 })
    expect(PLAN_CATALOG.growing_organization.monthlyCents).toBe(12900)
    expect(PLAN_CATALOG.established_organization.annualCents).toBe(249000)
  })

  test('requires explicit organization plan keys', () => {
    expect(getAllAccessPriceKeys('org', 'month')).toEqual([])
    expect(getAllAccessPriceKeys('org', 'month', 'growing_organization')).toEqual(['STRIPE_PRICE_GROWING_ORGANIZATION_MONTHLY'])
    expect(getAllAccessPriceKeys('org', 'year', 'established_organization')).toEqual(['STRIPE_PRICE_ESTABLISHED_ORGANIZATION_ANNUAL'])
  })

  test('keeps legacy plans compatible without changing their stored records', () => {
    expect(normalizePlanKey('coach_all_access', 'coach')).toBe('team_starter')
    expect(normalizePlanKey('org_all_access', 'org')).toBe('established_organization')
    expect(normalizePlanKey('org_starter', 'org')).toBe('growing_organization')
    expect(normalizePlanKey('org_growth', 'org')).toBe('established_organization')
  })
})
