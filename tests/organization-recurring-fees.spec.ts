import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('recurring fee checkout is bearer-authenticated and server-authorized', () => {
  const route = read('src/app/api/mobile/recurring-fees/start/route.ts')
  expect(route).toContain('getMobileRequestUser(request)')
  expect(route).toContain('authorizeRecurringFeePayer')
  expect(route).toContain("athlete_organization_memberships")
  expect(route).toContain("['active', 'trialing']")
  expect(route).toContain('isStripeConnectEnabled')
  expect(route).not.toMatch(/body\.(stripe_customer_id|stripe_connected_account_id|platform_fee)/)
})

test('recurring checkout uses integer cents, card and ACH, Connect, and four percent on every invoice', () => {
  const route = read('src/app/api/mobile/recurring-fees/start/route.ts')
  expect(route).toContain("payment_method_types: ['card', 'us_bank_account']")
  expect(route).toContain("unit_amount: amountCents")
  expect(route).toContain('application_fee_percent: RECURRING_FEE_PLATFORM_PERCENT')
  expect(route).toContain('transfer_data: { destination:')
  expect(route).toContain("platform_fee_bps: 400")
  expect(route).toContain('checkout_url: session.url')
  expect(route).toContain('expires_at: new Date(session.expires_at * 1000).toISOString()')
})

test('billing portal is limited to the payer or Superadmin', () => {
  const route = read('src/app/api/mobile/recurring-fees/billing-portal/route.ts')
  expect(route).toContain('fee.payer_user_id !== user.id')
  expect(route).toContain('isSuperadminUser(user)')
  expect(route).toContain('stripe.billingPortal.sessions.create')
  expect(route).not.toMatch(/card_number|bank_account_number|security_code|\bcvc\b/i)
})

test('signed idempotent webhook covers the recurring billing lifecycle', () => {
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  const service = read('src/lib/recurringFees.ts')
  expect(webhook).toContain('stripe.webhooks.constructEvent')
  expect(webhook).toContain("code === '23505'")
  for (const event of [
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
    'customer.subscription.paused', 'customer.subscription.resumed',
    'invoice.payment_succeeded', 'invoice.payment_failed', 'payment_method.updated', 'charge.refunded', 'charge.dispute',
  ]) expect(webhook).toContain(event)
  for (const status of ['paused', 'canceled', 'past_due', 'payment_failed', 'refunded', 'partially_refunded', 'disputed']) {
    expect(service).toContain(status)
  }
  expect(service).toContain("transactionType: 'dues'")
  expect(service).toContain('syncPaymentIntentToLedger')
})

test('migration stores Stripe references without sensitive payment credentials and enforces RLS', () => {
  const sql = read('supabase/migrations/20260918020000_organization_recurring_fees.sql')
  expect(sql).toContain('enable row level security')
  expect(sql).toContain('payer_user_id=auth.uid()')
  expect(sql).toContain('public.is_org_director')
  expect(sql).toContain('public.is_superadmin')
  expect(sql).toContain('platform_fee_bps integer not null default 400 check(platform_fee_bps = 400)')
  expect(sql).not.toMatch(/card_number|bank_account_number|security_code|\bcvc\b/i)
})
