import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('webhook fulfillment persists authoritative Stripe Connect accounting', () => {
  const fulfillment = source('src/lib/mobileCheckoutFulfillment.ts')
  const webhook = source('src/app/api/stripe/webhook/route.ts')
  const migration = source('supabase/migrations/20260731120000_stripe_connect_payment_accounting.sql')

  for (const field of [
    'gross_amount_cents',
    'platform_fee_cents',
    'platform_fee_rate',
    'connected_account_destination',
    'net_amount_cents',
  ]) {
    expect(fulfillment).toContain(field)
    expect(migration).toContain(field)
  }
  expect(fulfillment).toContain("onConflict: 'stripe_payment_intent_id'")
  expect(webhook).toContain('persistStripeConnectPaymentAccounting(session)')
})

test('only the centralized refund service creates Stripe refunds', () => {
  const centralized = source('src/lib/refundRequests.ts')
  const support = source('src/app/api/admin/support/actions/route.ts')
  const orgLegacy = source('src/app/api/org/marketplace/orders/[id]/refund/route.ts')
  const adminOrders = source('src/app/api/admin/orders/route.ts')

  expect(centralized).toContain('stripe.refunds.create')
  expect(centralized).toContain('refund_application_fee: true')
  expect(centralized).toContain('reverse_transfer: true')
  expect(centralized).toContain('refund-request-${requestId}')
  for (const legacy of [support, orgLegacy, adminOrders]) {
    expect(legacy).not.toContain('stripe.refunds.create')
    expect(legacy).toContain('refund queue')
  }
})

test('mobile payment relays return checkout URL, expiration, and backend fee breakdown', () => {
  for (const path of [
    'src/app/api/stripe/fee-checkout/route.ts',
    'src/app/api/stripe/mobile-marketplace-checkout/route.ts',
    'src/app/api/stripe/cart-checkout/route.ts',
  ]) {
    const route = source(path)
    expect(route).toContain('checkout_url')
    expect(route).toContain('expires_at')
    expect(route).toContain('fee_breakdown')
    expect(route).toContain('gross_cents')
    expect(route).toContain('platform_fee_cents')
    expect(route).toContain('stripe_processing_fee_cents')
    expect(route).toContain('net_cents')
    expect(route).toContain('fee_rate')
  }
})
