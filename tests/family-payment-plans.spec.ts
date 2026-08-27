import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('authoritative family plan migration remains additive and integer cents', () => {
  const migration = source('supabase/migrations/20260827010000_family_payment_plans.sql')
  expect(migration).toContain('family_payment_plan_enrollments')
  expect(migration).toContain('family_payment_plan_installments')
  expect(migration).toContain('amount_cents bigint')
  expect(migration).toContain('stripe_payment_method_id text')
  expect(migration).toContain('revoke insert,update,delete')
})

test('mobile installment checkout charges first installment and saves the card', () => {
  const checkout = source('src/app/api/mobile/checkout/route.ts')
  expect(checkout).toContain("type === 'installment'")
  expect(checkout).toContain("setup_future_usage: 'off_session'")
  expect(checkout).toContain("consent_collection: { terms_of_service: 'required' }")
  expect(checkout).toContain('autopay_consent_text: consentText')
  expect(checkout).toContain('familyPaymentPlanInstallmentId')
  expect(checkout).toContain('idempotency_key is required')
  expect(checkout).toContain('application_fee_amount: feeBreakdown.platformFeeCents')
})

test('later installments are claimed and dispatched idempotently off session', () => {
  const service = source('src/lib/familyPaymentPlans.ts')
  expect(service).toContain("off_session: true")
  expect(service).toContain('stripe_connected_account_id')
  expect(service).toContain('family-installment:${row.id}:attempt:${attempt}')
  expect(service).toContain(".in('status', ['scheduled', 'failed', 'past_due']).eq('attempt_count', row.attempt_count)")
  expect(source('vercel.json')).toContain('/api/reminders/family-installments')
})

test('webhooks authoritatively reconcile installment and enrollment state', () => {
  const webhook = source('src/app/api/stripe/webhook/route.ts')
  const ledger = source('src/lib/paymentLedger.ts')
  expect(webhook).toContain('syncFamilyInstallmentFailed(intent)')
  expect(webhook).toContain("event.type === 'payment_intent.requires_action'")
  expect(webhook).toContain('syncFamilyInstallmentRefunded(paymentIntentId)')
  expect(ledger).toContain('syncFamilyInstallmentSucceeded(intent, transaction.id)')
  expect(source('src/lib/familyPaymentPlans.ts')).toContain('autopay_consent_confirmed_at')
})

test('transaction fees use account configuration and never coupon data', () => {
  const fees = source('src/lib/orgPlatformFees.ts')
  const family = source('src/lib/familyPaymentPlans.ts')
  expect(fees).toContain('DEFAULT_PROCESSING_FEE_RATE = 0.04')
  expect(fees).toContain(".select('processing_fee_rate')")
  expect(family).toContain('calculateOrgPlatformFeeForOrg')
  expect(family.toLowerCase()).not.toContain('coupon')
})
