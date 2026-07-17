import { expect, test } from '@playwright/test'
import { getConnectRefundOptions } from '../src/lib/stripeConnectRefund'
import {
  isMissingStripeCustomerError,
  MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE,
} from '../src/lib/stripeCustomerErrors'
import {
  getOrderDisputeRefundStatus,
  resolveStripeBillingRole,
  resolveStripeSubscriptionContext,
} from '../src/lib/stripeWebhookHelpers'
import {
  calculateOrgPlatformFee,
  calculateStripeProcessingFeeCents,
  getOrgPlatformFeeRate,
  getSessionFeeRateForRollingVolume,
  resolveOrgPlatformFeeKind,
} from '../src/lib/orgPlatformFees'

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

test.describe('Stripe customer error helpers', () => {
  test('detects stale Stripe customer IDs from resource_missing errors', () => {
    expect(isMissingStripeCustomerError({
      code: 'resource_missing',
      param: 'customer',
      message: "No such customer: 'cus_missing'",
    })).toBe(true)

    expect(isMissingStripeCustomerError({
      raw: {
        code: 'resource_missing',
        message: "No such customer: 'cus_missing'",
      },
    })).toBe(true)

    expect(MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE).toContain('No active Stripe billing account found')
  })

  test('does not treat unrelated Stripe errors as stale customers', () => {
    expect(isMissingStripeCustomerError({
      code: 'resource_missing',
      param: 'subscription',
      message: 'No such subscription',
    })).toBe(false)
    expect(isMissingStripeCustomerError({ code: 'card_declined' })).toBe(false)
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

test.describe('Org platform fee helpers', () => {
  test('calculates tier-aware org session platform fees', () => {
    const standard = calculateOrgPlatformFee({ amountCents: 10000, tier: 'standard', kind: 'session' })
    const growth = calculateOrgPlatformFee({ amountCents: 10000, tier: 'growth', kind: 'session' })
    const enterprise = calculateOrgPlatformFee({ amountCents: 10000, tier: 'enterprise', kind: 'session' })

    expect(standard.platformFeeCents).toBe(1000)
    expect(standard.netCents).toBe(9000)
    expect(growth.platformFeeCents).toBe(700)
    expect(enterprise.platformFeeCents).toBe(500)
  })

  test('uses flat org marketplace platform fee', () => {
    expect(getOrgPlatformFeeRate('standard', 'marketplace')).toBe(10)
    const fee = calculateOrgPlatformFee({ amountCents: 25000, tier: 'enterprise', kind: 'marketplace' })

    expect(fee.platformFeeCents).toBe(2500)
    expect(fee.stripeProcessingFeeCents).toBe(755)
    expect(fee.netCents).toBe(22500)
  })

  test('caps marketplace platform fees at $75', () => {
    const belowCap = calculateOrgPlatformFee({ amountCents: 74000, kind: 'marketplace' })
    const atCap = calculateOrgPlatformFee({ amountCents: 75000, kind: 'marketplace' })
    const aboveCap = calculateOrgPlatformFee({ amountCents: 120000, kind: 'marketplace' })

    expect(belowCap.platformFeeCents).toBe(7400)
    expect(atCap.platformFeeCents).toBe(7500)
    expect(aboveCap.platformFeeCents).toBe(7500)
  })

  test('calculates each rolling-volume session fee tier boundary', () => {
    expect(getSessionFeeRateForRollingVolume(0)).toBe(10)
    expect(getSessionFeeRateForRollingVolume(2_499_999)).toBe(10)
    expect(getSessionFeeRateForRollingVolume(2_500_000)).toBe(7)
    expect(getSessionFeeRateForRollingVolume(9_999_999)).toBe(7)
    expect(getSessionFeeRateForRollingVolume(10_000_000)).toBe(5)

    expect(calculateOrgPlatformFee({ amountCents: 10000, kind: 'session', rollingVolumeCents: 0 }).platformFeeCents).toBe(1000)
    expect(calculateOrgPlatformFee({ amountCents: 10000, kind: 'session', rollingVolumeCents: 2_500_000 }).platformFeeCents).toBe(700)
    expect(calculateOrgPlatformFee({ amountCents: 10000, kind: 'session', rollingVolumeCents: 10_000_000 }).platformFeeCents).toBe(500)
  })

  test('keeps Stripe processing fee separate from platform fee', () => {
    const breakdown = calculateOrgPlatformFee({ amountCents: 10000, kind: 'marketplace' })

    expect(breakdown.platformFeeCents).toBe(1000)
    expect(breakdown.stripeProcessingFeeCents).toBe(calculateStripeProcessingFeeCents(10000))
    expect(breakdown.stripeProcessingFeeCents).toBe(320)
  })

  test('resolves org fee kind from source metadata', () => {
    expect(resolveOrgPlatformFeeKind('org_fee')).toBe('session')
    expect(resolveOrgPlatformFeeKind('session_booking')).toBe('session')
    expect(resolveOrgPlatformFeeKind('cart_checkout', 'marketplace_digital')).toBe('marketplace')
  })
})
