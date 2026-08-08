import { expect, test } from '@playwright/test'
import { ALL_ACCESS_PRICING, getAllAccessPriceKeys } from '../src/lib/allAccessPricing'

test.describe('approved subscription pricing contract', () => {
  test('uses the approved recurring amounts', () => {
    expect(ALL_ACCESS_PRICING.coach).toEqual({ month: 9900, year: 99000 })
    expect(ALL_ACCESS_PRICING.org.plans.org_starter).toEqual({ month: 39900, year: 399000 })
    expect(ALL_ACCESS_PRICING.org.plans.org_growth).toEqual({ month: 99900, year: 999000 })
  })

  test('requires explicit organization plan keys', () => {
    expect(getAllAccessPriceKeys('org', 'month')).toEqual([])
    expect(getAllAccessPriceKeys('org', 'month', 'org_starter')).toEqual(['STRIPE_PRICE_ORG_STARTER_MONTHLY'])
    expect(getAllAccessPriceKeys('org', 'year', 'org_growth')).toEqual(['STRIPE_PRICE_ORG_GROWTH_ANNUAL'])
  })
})
