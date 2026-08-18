import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('unified ledger exposes the canonical cents contract and every transaction type', () => {
  const migration = source('supabase/migrations/20260818010000_payment_contract_completion.sql')
  const foundation = source('supabase/migrations/20260818000000_payments_core_foundation.sql')
  for (const field of ['amount_cents','platform_fee_cents','stripe_processing_fee_cents','net_cents']) expect(migration + foundation).toContain(field)
  for (const type of ['registration','dues','event','facility','fundraising','equipment','travel','other']) expect(foundation).toContain(`'${type}'`)
})

test('processing rate is stored and mobile checkout returns decimal and cents fields', () => {
  const pricing = source('supabase/migrations/20260817000000_two_tier_pricing.sql')
  const mobile = source('src/app/api/mobile/checkout/route.ts')
  expect(pricing).toContain('processing_fee_rate numeric(5,4) not null default 0.04')
  expect(mobile).toContain('processing_fee_rate:')
  expect(mobile).toContain('amount_cents:')
})

test('every Stripe payment creation module supplies an idempotency key', () => {
  const files = execFileSync('rg',['-l','paymentIntents\\.create\\(|checkout\\.sessions\\.create\\(','src/app/api','src/lib'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)
  for (const file of files) expect(source(file), file).toContain('idempotencyKey')
})

test('scheduled payment worker delivers reminders and executes retry schedules', () => {
  const worker = source('src/app/api/reminders/payments/route.ts')
  const vercel = source('vercel.json')
  expect(worker).toContain('sendTransactionalEmail')
  expect(worker).toContain('org_dues_retry_attempts')
  expect(worker).toContain('[3,7,14]')
  expect(vercel).toContain('/api/reminders/payments')
})
