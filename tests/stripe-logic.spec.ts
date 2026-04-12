import { expect, test } from '@playwright/test'
import { getConnectRefundOptions } from '../src/lib/stripeConnectRefund'
import {
  getOrderDisputeRefundStatus,
  resolveStripeBillingRole,
  resolveStripeSubscriptionContext,
} from '../src/lib/stripeWebhookHelpers'

test.describe('Stripe refund helpers', () => {
  test('enables transfer reversal and application fee refund for destination charges', () => {
    const options = getConnectRefundOptions({
      application_fee: 'fee_123',
      transfer_data: { destination: 'acct_123' } as any,
    } as any)

    expect(options.applicationFeeId).toBe('fee_123')
    expect(options.refundApplicationFee).toBe(true)
    expect(options.reverseTransfer).toBe(true)
  })

  test('does not request Connect refund flags for plain platform charges', () => {
    const options = getConnectRefundOptions({
      application_fee: null,
      transfer_data: null,
    } as any)

    expect(options.applicationFeeId).toBeNull()
    expect(options.refundApplicationFee).toBe(false)
    expect(options.reverseTransfer).toBe(false)
  })
})

test.describe('Stripe webhook helpers', () => {
  test('maps org-flavored roles to org billing', () => {
    expect(resolveStripeBillingRole('coach')).toBe('coach')
    expect(resolveStripeBillingRole('athlete')).toBe('athlete')
    expect(resolveStripeBillingRole('org_admin')).toBe('org')
    expect(resolveStripeBillingRole('org')).toBe('org')
    expect(resolveStripeBillingRole('random_role')).toBeNull()
  })

  test('derives order dispute status consistently', () => {
    expect(getOrderDisputeRefundStatus('charge.dispute.created', 'warning_needs_response')).toBe('disputed')
    expect(getOrderDisputeRefundStatus('charge.dispute.closed', 'won')).toBe('resolved')
    expect(getOrderDisputeRefundStatus('charge.dispute.closed', 'lost')).toBe('chargeback')
  })

  test('prefers price-mapped subscription context over stale metadata tier', () => {
    const resolved = resolveStripeSubscriptionContext({
      metadata: {
        billing_role: 'coach',
        tier: 'starter',
      },
      priceMapping: {
        role: 'coach',
        tier: 'pro',
      },
    })

    expect(resolved.billingRole).toBe('coach')
    expect(resolved.tier).toBe('pro')
  })
})
