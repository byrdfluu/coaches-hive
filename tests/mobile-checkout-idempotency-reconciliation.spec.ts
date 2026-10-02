import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('all mobile money entry points require a client idempotency key', () => {
  for (const file of [
    'src/app/api/mobile/checkout/route.ts',
    'src/app/api/mobile/family/offerings/prepare/route.ts',
    'src/app/api/mobile/offerings/recurring-checkout/route.ts',
    'src/app/api/mobile/training-packages/purchase/route.ts',
    'src/app/api/mobile/recurring-fees/start/route.ts',
    'src/app/api/stripe/cart-checkout/route.ts',
    'src/app/api/stripe/mobile-marketplace-checkout/route.ts',
  ]) {
    expect(read(file), file).toContain('idempotencyKeyFor(request')
  }
})

test('checkout responses use the canonical mobile contract', () => {
  const helper = read('src/lib/checkoutAttempts.ts')
  for (const field of ['purchase_id', 'checkout_record_id', 'checkout_type', 'checkout_url',
    'expires_at', 'status', 'request_id', 'fee_breakdown']) {
    expect(helper).toContain(field)
  }
  expect(helper).toContain("'X-Request-ID': requestId")
})

test('durable attempts and reconciliation are migration-backed and scheduled', () => {
  const migration = read('supabase/migrations/20261002030000_durable_checkout_attempts.sql')
  expect(migration).toContain('create table if not exists public.checkout_purchase_attempts')
  expect(migration).toContain('unique (buyer_user_id, checkout_type, idempotency_key)')
  expect(migration).toContain('checkout_purchase_attempts_stripe_session_uidx')

  const reconciliation = read('src/app/api/cron/checkout-reconciliation/route.ts')
  expect(reconciliation).toContain('fulfillMobileCheckoutSession(session)')
  expect(reconciliation).toContain("status: 'expired'")
  expect(reconciliation).toContain('notifySuperadmins')

  const vercel = JSON.parse(read('vercel.json'))
  expect(vercel.crons).toContainEqual({ path: '/api/cron/checkout-reconciliation', schedule: '*/5 * * * *' })
})

test('expired marketplace sessions are never returned to the app', () => {
  const marketplace = read('src/app/api/stripe/mobile-marketplace-checkout/route.ts')
  expect(marketplace).toContain("prior?.status === 'open'")
  expect(marketplace).toContain("status: 'expired'")
  expect(marketplace).toContain('Start a new purchase to continue.')

  const training = read('src/app/api/mobile/training-packages/purchase/route.ts')
  expect(training).toContain('stripe_checkout_session_id: null')
})

test('server checkout binding remains protected but is not mistaken for fulfillment', () => {
  const migration = read('supabase/migrations/20261002040000_allow_server_checkout_binding.sql')
  expect(migration).toContain("auth.role()='service_role'")
  expect(migration).toContain('protect_program_registration_payment_state')
  expect(migration).toContain('protect_tryout_registration_payment_state')
  expect(migration).toContain('Final payment state can only be changed by the trusted payment service')

  const training = read('src/app/api/mobile/training-packages/purchase/route.ts')
  expect(training).toContain(".eq('package_id', packageId).eq('athlete_id', athleteId).eq('purchaser_user_id', user.id)")
  expect(training).toContain(".eq('status', 'pending')")
})
