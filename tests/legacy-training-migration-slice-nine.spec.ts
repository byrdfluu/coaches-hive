import { expect, test } from '@playwright/test'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('legacy organization catalog is read-only and points creation to unified offerings', () => {
  const route = read('src/app/api/org/training-packages/route.ts')
  const list = read('src/app/org/training-packages/page.tsx')
  const detail = read('src/app/org/training-packages/[id]/page.tsx')
  const sessions = read('src/app/org/training-sessions/page.tsx')
  const coaches = read('src/app/org/offering-coaches/[kind]/[id]/page.tsx')
  expect(route).toContain('LEGACY_TRAINING_CATALOG_READ_ONLY')
  expect(route).toContain("redirect_url:'/org/offerings/new'")
  expect(route).not.toContain(".from('org_training_packages').insert")
  expect(route).not.toContain("rpc('set_org_training_package_status'")
  expect(detail).not.toContain("method:'POST'")
  expect(sessions).not.toContain('save_org_training_sessions_with_coaches')
  expect(coaches).not.toContain('set_org_training_package_coaches')
  expect(coaches).not.toContain('set_org_training_session_coaches')
  expect(list).toContain('/org/offerings/new')
})

test('legacy purchase endpoint redirects to the mapped unified program without creating purchases or checkout', () => {
  const route = read('src/app/api/mobile/training-packages/purchase/route.ts')
  const sessionCheckout = read('src/app/api/mobile/training-sessions/checkout/route.ts')
  expect(route).toContain('LEGACY_TRAINING_PURCHASE_DISABLED')
  expect(route).toContain('legacyTrainingMigration(packageId)')
  expect(route).toContain('legacyTrainingRedirect')
  expect(route).not.toContain("from('org_training_package_purchases')")
  expect(route).not.toContain('stripe.checkout.sessions.create')
  expect(route).not.toContain('request_org_training_package_purchase')
  expect(sessionCheckout).toContain('LEGACY_TRAINING_PURCHASE_DISABLED')
  expect(sessionCheckout).toContain("from('legacy_training_package_migrations')")
  expect(sessionCheckout).not.toContain('stripe.checkout.sessions.create')
})

test('family storefront suppresses legacy cards but retains read-only purchase history', () => {
  const storefront = read('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain('legacy_training_archive')
  expect(storefront).toContain('repurchase_available:false')
  expect(storefront).not.toContain("offerings.push({offering_type:'training_package'")
  expect(storefront).toContain("from('programs')")
})

test('existing legacy credits, booking cancellation, subscriptions and webhooks remain operational', () => {
  const athlete = read('src/app/api/athlete/training-packages/route.ts')
  const billing = read('src/app/api/mobile/training-packages/billing-portal/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(athlete).toContain("rpc('my_credit_balances'")
  expect(athlete).toContain("rpc('book_org_training_sessions_with_credits'")
  expect(athlete).toContain("rpc('cancel_org_training_booking'")
  expect(billing).toContain('stripe.billingPortal.sessions.create')
  expect(webhook).toContain('org_training_package')
  expect(webhook).toContain('activate_org_training_purchase')
})

test('migration status is tenant scoped, private, read-only, and flags reconciliation exceptions', () => {
  const route = read('src/app/api/org/training-migration-status/route.ts')
  expect(route).toContain("from('legacy_training_migration_inventory')")
  expect(route).toContain("from('legacy_training_credit_reconciliation')")
  expect(route).toContain(".eq('org_id', org.organizationId)")
  expect(route).toContain("row.reconciliation_status !== 'reconciled_legacy_authoritative'")
  expect(route).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
  expect(route).not.toContain('superadmin')
})

