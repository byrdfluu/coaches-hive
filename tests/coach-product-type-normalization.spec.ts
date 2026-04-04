import { expect, test } from '@playwright/test'
import { normalizeCoachProductType } from '../src/lib/coachMarketplaceProductType'

test.describe('coach product type normalization', () => {
  test('maps digital formats to the canonical digital type', () => {
    expect(normalizeCoachProductType('digital')).toBe('digital')
  })

  test('maps physical formats to the canonical physical type', () => {
    expect(normalizeCoachProductType('physical')).toBe('physical')
  })

  test('falls back to digital when format is empty', () => {
    expect(normalizeCoachProductType('')).toBe('digital')
  })
})
