import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('all supported family offering types create server-authoritative Stripe checkout metadata', () => {
  const checkout = read('src/app/api/mobile/checkout/route.ts')
  const recurring = read('src/app/api/mobile/recurring-fees/start/route.ts')
  const training = read('src/app/api/mobile/training-packages/purchase/route.ts')
  for (const type of ['org_fee', 'mobile_program', 'mobile_tryout', 'mobile_marketplace']) {
    expect(checkout).toContain(`checkout_type: '${type}'`)
  }
  expect(recurring).toContain('RECURRING_FEE_SOURCE')
  expect(recurring).toContain('organizationPaymentMetadata(paymentContract)')
  expect(training).toContain("checkout_type: 'training_package'")
  expect(training).toContain("loadStripeConnectAccountStatus('org', purchase.org_id")
})

test('verified webhooks drive fulfillment, ledger, receipts, and Connect accounting', () => {
  const checkout = read('src/app/api/mobile/checkout/route.ts')
  const training = read('src/app/api/mobile/training-packages/purchase/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  const fulfillment = read('src/lib/mobileCheckoutFulfillment.ts')
  const ledger = read('src/lib/paymentLedger.ts')
  expect(webhook).toContain('stripe.webhooks.constructEvent(body, sig, secret)')
  expect(checkout).toContain('fulfillMobileCheckoutSession(existingSession)')
  expect(webhook).toContain("syncPaymentIntentToLedger(event.data.object as Stripe.PaymentIntent, 'processing')")
  expect(fulfillment).toContain('persistStripeConnectPaymentAccounting(session)')
  expect(fulfillment).toContain("rpc('complete_fee_payment'")
  expect(fulfillment).toContain("from('program_registrations')")
  expect(fulfillment).toContain("rpc('complete_tryout_registration'")
  expect(fulfillment).toContain("rpc('complete_marketplace_order'")
  expect(fulfillment).toContain("rpc('activate_org_training_purchase'")
  expect(ledger).toContain("from('payment_transactions')")
  expect(ledger).toContain("from('payment_receipts')")
  for (const field of ['gross_amount_cents', 'platform_fee_cents', 'stripe_processing_fee_cents', 'net_amount_cents', 'athlete_profile_id']) {
    expect(ledger).toContain(field)
  }
  for (const name of ['program.name', 'tryout.title', 'item.name']) expect(checkout).toContain(name)
  expect(training).toContain('title: pkg.name')
  expect(webhook).toContain("subscriptionMetadata.source === 'org_training_package'")
  expect(webhook).toContain("p_cycle_key: String(invoice.id || trainingPaymentIntentId || '')")
})

test('historical family purchases are backfilled from authoritative offering records', () => {
  const migration = read('supabase/migrations/20261002060000_backfill_mobile_payment_attribution.sql')
  for (const table of ['org_training_package_purchases', 'program_registrations', 'org_tryout_registrations', 'marketplace_items']) {
    expect(migration).toContain(table)
  }
  expect(migration).toContain('athlete_profile_id=')
  expect(migration).toContain('description=package.name')
  expect(migration).toContain('description=program.name')
  expect(migration).toContain('description=tryout.title')
  expect(migration).toContain('description=item.name')
  expect(migration).toContain('payment_receipts')
})

test('organization and superadmin reporting read authoritative payment records', () => {
  const revenue = read('supabase/migrations/20260809030000_test_data_classification.sql')
  const reports = read('src/app/api/org/payment-dashboard/route.ts')
  expect(revenue).toContain('stripe_connect_payment_accounting')
  expect(revenue).toContain('where a.livemode=true')
  expect(revenue).toContain('admin_revenue_ledger')
  expect(reports).toContain("from('payment_transactions')")
  expect(reports).toContain("eq('org_id', orgId)")
})

test('SQL integrity audit checks stuck and duplicate Stripe events', () => {
  const audit = read('supabase/tests/platform_integrity_audit.sql')
  expect(audit).toContain("status in ('failed','processing')")
  expect(audit).toContain("interval '15 minutes'")
  expect(audit).toContain('group by event_id having count(*)>1')
})
