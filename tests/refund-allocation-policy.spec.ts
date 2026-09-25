import { expect, test } from '@playwright/test'
import { calculateRefundAllocation } from '../src/lib/refundAllocation'

const payment = { baseAmountCents: 10_000, serviceFeeCents: 380, platformFeeCents: 400, organizationNetCents: 9_600, stripeProcessingFeeCents: 331 }

test('standard refund returns base, pulls back org payout, and retains service fee', () => {
  expect(calculateRefundAllocation({ type: 'standard', requestedBaseRefundCents: 10_000, ...payment })).toEqual({
    baseRefundCents: 10_000, serviceFeeRefundCents: 0, parentRefundCents: 10_000,
    transferReversalCents: 9_600, organizationReceivableCents: 0,
    parentEndBalanceCents: 380, organizationEndBalanceCents: 0, platformEndBalanceCents: 49,
  })
})

test('org-caused refund returns total and records service fee receivable', () => {
  expect(calculateRefundAllocation({ type: 'full_org_caused', requestedBaseRefundCents: 10_000, ...payment })).toEqual({
    baseRefundCents: 10_000, serviceFeeRefundCents: 380, parentRefundCents: 10_380,
    transferReversalCents: 9_600, organizationReceivableCents: 380,
    parentEndBalanceCents: 0, organizationEndBalanceCents: -380, platformEndBalanceCents: 49,
  })
})

test('partial refunds scale upward in the platform favor per installment', () => {
  const standard = calculateRefundAllocation({ type: 'standard', requestedBaseRefundCents: 2_500, ...payment })
  expect(standard.transferReversalCents).toBe(2_400)
  expect(standard.parentRefundCents).toBe(2_500)
  const full = calculateRefundAllocation({ type: 'full_org_caused', requestedBaseRefundCents: 2_500, ...payment })
  expect(full.serviceFeeRefundCents).toBe(95)
  expect(full.organizationReceivableCents).toBe(95)
  expect(full.platformEndBalanceCents).toBe(349)
})
