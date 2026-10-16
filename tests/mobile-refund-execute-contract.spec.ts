import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/mobile/refunds/execute/route.ts'), 'utf8')

test('money refund accepts the canonical request fields and validates approved cents', () => {
  for (const field of ['request_id', 'action', 'resolution_note', 'idempotency_key', 'approved_amount_cents']) expect(source).toContain(field)
  expect(source).toContain("action!=='money_refund'")
  expect(source).toContain('approved>requested')
})

test('connected destination refund is idempotent and applied after Stripe responds', () => {
  expect(source).toContain('reverse_transfer:true')
  expect(source).toContain('refund_application_fee:true')
  expect(source).toContain('offering-refund-${requestId}')
  const stripeCall = source.indexOf('stripe.refunds.create')
  const applyCall = source.indexOf("rpc('apply_offering_refund_result'")
  expect(stripeCall).toBeGreaterThan(0)
  expect(applyCall).toBeGreaterThan(stripeCall)
})

test('response contains refund status identity and restored-session counters', () => {
  for (const field of ['status:applied?.status', 'stripe_refund_id:refund.id', 'restored_group_credits', 'restored_one_on_one_credits']) expect(source).toContain(field)
  expect(source).not.toContain('credits_only')
  expect(source).not.toContain('money_and_credits')
})
