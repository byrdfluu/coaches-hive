import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('dated family offerings exclude archived and past inventory', () => {
  const storefront = source('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain(".is('archived_at', null)")
  expect(storefront).toContain('end_date.gte.')
  expect(storefront).toContain(".gte('tryout_date'")
  expect(storefront).toContain('end_time.gt.')
})

test('server-side reconciliation archives expired offerings and abandoned purchases', () => {
  const cron = source('src/app/api/cron/checkout-reconciliation/route.ts')
  const migration = source('supabase/migrations/20261003020000_offering_expiration_and_abandoned_training_checkout.sql')
  expect(cron).toContain("rpc('archive_expired_family_offerings')")
  expect(migration).toContain('create or replace function public.archive_expired_family_offerings()')
  expect(migration).toContain("created_at < now() - interval '30 minutes'")
  expect(migration).toContain('set superseded_at = now()')
  expect(migration).toContain('add column if not exists superseded_at')
  expect(migration).toContain('current or future program date')
  expect(migration).toContain('current or future tryout date')
  expect(migration).toContain('current or future session date')
})

test('no-session pending package does not appear purchased and retry without purchase id starts checkout', () => {
  const storefront = source('src/app/api/mobile/family/storefront/route.ts')
  const purchase = source('src/app/api/mobile/training-packages/purchase/route.ts')
  expect(storefront).toContain("row.status==='pending'&&Boolean(row.stripe_checkout_session_id)")
  expect(storefront).toContain("from('checkout_purchase_attempts')")
  expect(storefront).toContain("new Date(attempt.expires_at).getTime()>Date.now()")
  expect(storefront).toContain('resumablePending')
  expect(purchase).toContain(".eq('status', 'pending').is('superseded_at', null).order('created_at'")
  expect(purchase).toContain("stripe.checkout.sessions.create")
  expect(purchase).toContain("purchase_already_active")
  expect(purchase).toContain("purchase_not_resumable")
})
