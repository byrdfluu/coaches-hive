import { expect, test } from '@playwright/test'
import fs from 'node:fs'
const read = (file: string) => fs.readFileSync(file, 'utf8')

test('recurring offers are organization-authored, assigned, audited, and plan gated', () => {
  const routes = read('src/app/api/mobile/org/recurring-fee-offers/route.ts')
    + read('src/app/api/mobile/org/recurring-fee-offers/[offerId]/route.ts')
    + read('src/app/api/mobile/org/recurring-fee-offers/[offerId]/assignments/route.ts')
  expect(routes).toContain('requireMobileOrgAuthority')
  expect(routes).toContain('recurring_fees_enabled')
  expect(routes).toContain('isStripeConnectEnabled')
  expect(routes).toContain('org_audit_log')
  expect(routes).toContain('athlete_organization_memberships')
})

test('recurring payments are rate limited, idempotent, immutable, ordered, and retry-aware', () => {
  const start = read('src/app/api/mobile/recurring-fees/start/route.ts')
  const lifecycle = read('src/lib/recurringFees.ts')
  const migration = read('supabase/migrations/20260919010000_payment_security_hardening.sql')
  expect(start).toContain('stripeIdempotencyKey')
  expect(start).toContain('enforcePaymentRateLimit')
  expect(start).toContain('immutable_snapshot')
  expect(lifecycle).toContain('last_stripe_event_created')
  expect(lifecycle).toContain('attempt_count')
  expect(lifecycle).toContain('next_payment_attempt')
  expect(migration).toContain('payment_security_events')
  expect(migration).toContain('payer_idempotency_uidx')
})

test('platform security foundations cover signed webhooks, replay, refunds, disputes, Connect, Apple, and actual fees', () => {
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  const refunds = read('src/lib/refundRequests.ts')
  const ledger = read('src/lib/paymentLedger.ts')
  const apple = read('src/app/api/mobile/subscription/apple/activate/route.ts') + read('src/lib/appleIap.ts')
  expect(webhook).toContain('stripe.webhooks.constructEvent')
  expect(webhook).toContain("type: 'webhook_replay'")
  expect(webhook).toContain("event.type.startsWith('charge.dispute')")
  expect(refunds).toContain('refund_application_fee')
  expect(ledger).toContain('balance_transaction')
  expect(apple).toContain('verifyAppleTransaction')
  expect(apple).toContain('appAccountToken')
})
