import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const read = (file: string) => fs.readFileSync(file, 'utf8')

test('follow-up migration completes audit, atomic limits, service writes, RLS, and webhook uniqueness', () => {
  const sql = read('supabase/migrations/20260919020000_payment_security_contract_completion.sql')
  for (const value of ['payment_security_audit','payment_action_rate_limits','assert_payment_action_rate_limit','security definer',
    'revoke insert,update,delete','stripe_webhook_events_event_id_uidx','payment_transactions_operation_idempotency_uidx']) expect(sql).toContain(value)
  expect(sql).toContain('enable row level security')
})

test('all returned Stripe hosted URLs pass through the central allowlist', () => {
  const output = execFileSync('rg', ['-n','(checkout_url|portal_url|onboarding_url|\\{ url:)\\s*[^\\n]*\\.url','src/app/api'], { encoding: 'utf8' })
  for (const line of output.trim().split('\n').filter(Boolean)) expect(line, line).toContain('assertStripeHostedUrl')
  const security = read('src/lib/paymentSecurity.ts')
  for (const host of ['checkout.stripe.com','billing.stripe.com','connect.stripe.com','dashboard.stripe.com']) expect(security).toContain(host)
})

test('legacy client-authored payment intent is retired and canonical creation is protected', () => {
  expect(read('src/app/api/stripe/payment-intent/route.ts')).toContain('status: 410')
  const canonical = read('src/lib/canonicalPaymentIntent.ts')
  expect(canonical).toContain('enforcePaymentRateLimit')
  expect(canonical).toContain('idempotency_key')
  expect(canonical).toContain("['pending','processing','succeeded','paid']")
  expect(canonical).toContain('auditPaymentAction')
})

test('sensitive payment entry points use server-side rate limiting', () => {
  const files = [
    'src/app/api/mobile/checkout/route.ts','src/app/api/mobile/recurring-fees/start/route.ts',
    'src/app/api/mobile/recurring-fees/billing-portal/route.ts','src/app/api/mobile/billing-portal/route.ts',
    'src/app/api/mobile/connect/start/route.ts','src/app/api/mobile/subscription/start/route.ts',
    'src/app/api/mobile/subscription/apple/activate/route.ts','src/app/api/mobile/dues/[installmentId]/autopay/route.ts',
    'src/app/api/admin/refunds/route.ts','src/app/api/account/subscription/cancel/route.ts',
  ]
  for (const file of files) expect(read(file), file).toContain('enforcePaymentRateLimit')
})

test('webhook ledger validates authoritative amount currency payer target and destination', () => {
  const security = read('src/lib/paymentSecurity.ts')
  const ledger = read('src/lib/paymentLedger.ts')
  for (const phrase of ['amount does not match','currency does not match','payer does not match','target does not match','destination does not match']) expect(security).toContain(phrase)
  expect(ledger).toContain('validatePaymentIntentAuthority(intent)')
})

test('errors are structured and payment logs are sanitized', () => {
  const api = read('src/lib/mobilePaymentApi.ts')
  const security = read('src/lib/paymentSecurity.ts')
  for (const field of ['code:', 'retryable', 'reference_id']) expect(api).toContain(field)
  expect(security).toContain('safePaymentError')
  expect(security).not.toContain('Authorization')
})
