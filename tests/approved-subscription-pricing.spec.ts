import { expect, test } from '@playwright/test'
import { ALL_ACCESS_PRICING, getAllAccessPriceKeys } from '../src/lib/allAccessPricing'

test.describe('approved subscription pricing contract', () => {
  test('uses the approved recurring amounts', () => {
    expect(ALL_ACCESS_PRICING.coach).toEqual({ month: 9900, year: 99000 })
    expect(ALL_ACCESS_PRICING.org.month).toBe(49900)
    expect(ALL_ACCESS_PRICING.org.year).toBe(499000)
  })

  test('requires explicit organization plan keys', () => {
    expect(getAllAccessPriceKeys('org', 'month')).toEqual([])
    expect(getAllAccessPriceKeys('org', 'month', 'organization')).toEqual(['STRIPE_PRICE_ORG_ALL_ACCESS_MONTHLY'])
    expect(getAllAccessPriceKeys('org', 'year', 'organization')).toEqual(['STRIPE_PRICE_ORG_ALL_ACCESS_ANNUAL'])
  })
})
