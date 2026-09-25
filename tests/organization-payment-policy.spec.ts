import { expect, test } from '@playwright/test'
import {
  ORGANIZATION_PAYMENT_POLICY_VERSION,
  calculateOrganizationPayment,
} from '../src/lib/organizationPaymentPolicy'

const cases = [100, 1_000, 2_500, 10_000, 25_000, 100_000]

test('organization payment policy uses upward-rounded 4% and 3.5% plus 30 cents', () => {
  for (const base of cases) {
    const result = calculateOrganizationPayment(base)
    expect(result.base_amount_cents).toBe(base)
    expect(result.service_fee_cents).toBe(Math.ceil(base * 35 / 1_000) + 30)
    expect(result.platform_fee_cents).toBe(Math.ceil(base * 4 / 100))
    expect(result.total_cents).toBe(base + result.service_fee_cents)
    expect(result.organization_net_cents).toBe(base - result.platform_fee_cents)
    expect(result.application_fee_cents).toBe(result.platform_fee_cents + result.service_fee_cents)
    expect(result.service_fee_refundable).toBe(false)
    expect(result.policy_version).toBe(ORGANIZATION_PAYMENT_POLICY_VERSION)
  }
})

test('$100 contract matches the mobile and web response contract', () => {
  expect(calculateOrganizationPayment(10_000)).toEqual({
    base_amount_cents: 10_000,
    service_fee_cents: 380,
    platform_fee_cents: 400,
    total_cents: 10_380,
    organization_net_cents: 9_600,
    application_fee_cents: 780,
    payment_method_type: 'pending',
    service_fee_refundable: false,
    policy_version: '2026-09-25',
    agreement_version: '2026.09.24',
  })
})

test('payment plans assess the service fee per installment', () => {
  const installments = [3_334, 3_333, 3_333].map((amount) => calculateOrganizationPayment(amount))
  expect(installments.map((item) => item.service_fee_cents)).toEqual([147, 147, 147])
  expect(installments.reduce((sum, item) => sum + item.total_cents, 0)).toBe(10_441)
})
