import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('one-time mobile checkout requires a caller idempotency key and returns structured failures', () => {
  const route = read('src/app/api/mobile/checkout/route.ts')
  expect(route).toContain("const idempotencyKey = typeof body?.idempotency_key")
  expect(route).toContain("structuredError('duplicate_request'")
  expect(route).toContain('{error:{code,message,retryable,request_id:requestId}}')
  for (const type of ['fee', 'coach_fee', 'marketplace', 'program', 'installment', 'tryout', 'league_fee']) {
    expect(route).toContain(`type === '${type}'`)
  }
})

test('mobile checkout uses durable platform customers and canonical destination charges', () => {
  const route = read('src/app/api/mobile/checkout/route.ts')
  expect(route).toContain('async function ensureStripeCustomer')
  expect(route).toContain("stripe_customer_id:customer.id")
  expect(route).not.toContain('customer_email:')
  expect(route).toContain('organizationCheckoutLineItems')
  expect(route).toContain('application_fee_amount: paymentContract.application_fee_cents')
  expect(route).toContain('on_behalf_of: connectStatus!.stripeAccountId')
})

test('recurring checkout records explicit authorization and immutable commercial terms', () => {
  const route = read('src/app/api/mobile/recurring-fees/start/route.ts')
  expect(route).toContain('body.authorization_accepted === true')
  expect(route).toContain('authorization_accepted_at')
  expect(route).toContain('authorization_ip_hash')
  expect(route).toContain("consent_collection:{terms_of_service:'required'}")
  expect(route).toContain('offer_assignment_id: assignment.id')
  expect(route).toContain('immutable_snapshot: snapshot')
})

test('recurring fulfillment is webhook authoritative and grants credits once per invoice', () => {
  const worker = read('src/app/api/cron/organization-recurring-fees/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  const service = read('src/lib/recurringFees.ts')
  const migration = read('supabase/migrations/20260928010000_recurring_payment_authorization_and_credits.sql')
  expect(worker).toContain("status: 'processing'")
  expect(worker).not.toContain("status: 'paid'")
  expect(webhook).toContain('syncScheduledRecurringPaymentIntent')
  expect(service).toContain("onConflict:'recurring_fee_id,invoice_id'")
  expect(migration).toContain('unique(recurring_fee_id,invoice_id)')
})

test('refund execution binds the requested workspace to the payment owner', () => {
  const route = read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).toContain('requireWorkspaceContext(user.id,requestedWorkspaceId)')
  expect(route).toContain('workspace.organizationId===row.org_id')
  expect(route).toContain('workspace.leagueId===row.league_id')
  expect(route).toContain('approveAndProcessRefundRequest')
})
