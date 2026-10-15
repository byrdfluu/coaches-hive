import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('training package purchase RPC is tenant-safe and reloads PostgREST', () => {
  const sql = read('supabase/migrations/20261001050000_restore_training_package_purchase_request.sql')
  expect(sql).toContain('request_org_training_package_purchase')
  expect(sql).toContain('my_accessible_athlete_profiles()')
  expect(sql).toContain("my_accessible_athlete_profiles()")
  expect(sql).toContain("v_package.billing_type='recurring'")
  expect(sql).toContain("status in ('pending','active','past_due')")
  expect(sql).toContain("notify pgrst, 'reload schema'")
})

test('family storefront archives legacy training packages without checkout identifiers', () => {
  const route = read('src/app/api/mobile/family/storefront/route.ts')
  expect(route).toContain("from('org_training_packages')")
  expect(route).toContain("from('org_training_package_purchases')")
  expect(route).toContain('legacy_training_archive')
  expect(route).toContain('repurchase_available:false')
  expect(route).not.toContain("offerings.push({offering_type:'training_package'")
})

test('payment ledger supports PostgREST idempotent upserts by PaymentIntent', () => {
  const sql = read('supabase/migrations/20261001060000_repair_payment_transaction_idempotency.sql')
  expect(sql).toContain('drop index if exists public.payment_transactions_payment_intent_uidx')
  expect(sql).toMatch(/create unique index payment_transactions_payment_intent_uidx\s+on public\.payment_transactions\(stripe_payment_intent_id\)/)
  expect(sql).not.toContain('where stripe_payment_intent_id is not null')
})

test('legacy training purchase redirects while webhook activation remains for existing purchases', () => {
  const route = read('src/app/api/mobile/training-packages/purchase/route.ts')
  const fulfillment = read('src/lib/mobileCheckoutFulfillment.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(route).toContain('LEGACY_TRAINING_PURCHASE_DISABLED')
  expect(route).toContain('legacyTrainingMigration(packageId)')
  expect(route).not.toContain("from('athlete_organization_memberships')")
  expect(route).toContain('parseUuid(body.athlete_profile_id || body.athlete_id)')
  expect(route).toContain('parseUuid(body.package_id || body.offering_id)')
  expect(route).not.toContain("from('org_training_package_purchases')")
  expect(route).not.toContain('stripe.checkout.sessions.create')
  for (const field of ['base_amount_cents','service_fee_cents','total_cents','policy_version','agreement_version']) {
    expect(read('src/lib/organizationPaymentPolicy.ts')).toContain(field)
  }
  expect(fulfillment).toContain("type === 'training_package'")
  expect(fulfillment).toContain("rpc('activate_org_training_purchase'")
  expect(fulfillment).toContain('p_cycle_key: `one-time:${metadata.purchase_id}`')
  expect(webhook).toContain('p_cycle_key: invoice.id')
  expect(webhook).toContain('p_stripe_invoice_id: invoice.id')
  expect(webhook).toContain("metadata.source === 'org_training_package'")
})

test('legacy purchase is disabled while existing webhook activation and Billing Portal remain', () => {
  const purchase = read('src/app/api/mobile/training-packages/purchase/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  const fulfillment = read('src/lib/mobileCheckoutFulfillment.ts')
  const portal = read('src/app/api/mobile/training-packages/billing-portal/route.ts')
  expect(purchase).toContain('LEGACY_TRAINING_PURCHASE_DISABLED')
  expect(purchase).toContain('redirect_url')
  expect(webhook).toContain("event.type === 'checkout.session.completed'")
  expect(fulfillment).toContain("type === 'training_package'")
  expect(fulfillment).toContain("rpc('activate_org_training_purchase'")
  expect(portal).toContain("['active','past_due'].includes(String(purchase.status))")
  expect(portal).toContain('stripe.billingPortal.sessions.create')
  expect(portal).toContain('portal_url: assertStripeHostedUrl(session.url)')
})

test('training activation migration removes the ambiguous legacy overload', () => {
  const sql = read('supabase/migrations/20261001080000_resolve_training_activation_overload.sql')
  expect(sql).toContain('drop function if exists public.activate_org_training_purchase(uuid,uuid,text,timestamptz)')
  expect(sql).toContain('p_cycle_key text default null')
  expect(sql).toContain('p_stripe_invoice_id text default null')
  expect(sql).toContain('on conflict(purchase_id,cycle_key) do nothing')
})
