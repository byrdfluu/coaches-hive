import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/mobile/refunds/execute/route.ts'), 'utf8')

test('money refund accepts the canonical request fields and validates approved cents', () => {
  for (const field of ['request_id', 'action', 'resolution_note', 'idempotency_key', 'approved_amount_cents']) expect(source).toContain(field)
  expect(source).toContain("action!=='money_refund'")
  expect(source).toContain('approved>requested')
  expect(source).toContain('headerKey!==bodyKey')
  expect(source).toContain("row.status!=='approved'")
  expect(source).toContain('approved!==storedApproved')
})

test('connected destination refund is idempotent and applied after Stripe responds', () => {
  expect(source).toContain('reverse_transfer:true')
  expect(source).toContain('refund_application_fee:true')
  expect(source).toContain('{idempotencyKey:key}')
  const stripeCall = source.indexOf('stripe.refunds.create')
  const applyCall = source.indexOf("rpc('apply_offering_refund_result'")
  expect(stripeCall).toBeGreaterThan(0)
  expect(applyCall).toBeGreaterThan(stripeCall)
})

test('response contains only the canonical money-refund result', () => {
  for (const field of ["'refunded':'refund_processing'", 'stripe_refund_id:refund.id']) expect(source).toContain(field)
  expect(source).not.toContain('credits_only')
  expect(source).not.toContain('money_and_credits')
  expect(source).not.toContain('approve_offering_refund')
})

test('workspace organization permission and original charge are verified', () => {
  expect(source).toContain("select('organization_id').eq('id',workspaceId)")
  expect(source).toContain("workspace?.organization_id!==row.org_id")
  expect(source).toContain("p_permission:'manage_payments'")
  expect(source).toContain('tx.org_id!==row.org_id')
  expect(source).toContain('stripe_charge_id')
  expect(source).toContain('approved>remaining')
})

test('safe structured failures and replay response cover the mobile contract', () => {
  for (const code of ['AUTHENTICATION_REQUIRED','REFUND_REQUEST_NOT_FOUND','REFUND_FORBIDDEN','WORKSPACE_MISMATCH','ORIGINAL_CHARGE_NOT_FOUND','REFUND_AMOUNT_INVALID','AMOUNT_NOT_REFUNDABLE','STRIPE_ACCOUNT_NOT_READY','REFUND_ALREADY_PROCESSED','STRIPE_REFUND_FAILED']) expect(source).toContain(code)
  expect(source).toContain("row.stripe_refund_id&&['refunded','processing','refund_processing']")
})

test('error statuses match the mobile organization refund contract', () => {
  expect(source).toContain("fail('WORKSPACE_MISMATCH','Select the organization workspace connected to this refund.',403)")
  expect(source).toContain("fail('AMOUNT_NOT_REFUNDABLE','The approved amount exceeds the remaining refundable amount.',422)")
  expect(source).toContain("fail('STRIPE_ACCOUNT_NOT_READY','The organization Stripe account is not ready to process refunds.',422)")
  expect(source).toContain("fail('STRIPE_REFUND_FAILED','The refund could not be submitted to Stripe.',502)")
})

test('non-money decisions use the canonical resolution RPC and never reach Stripe', () => {
  expect(source).toContain("rpc('resolve_payment_refund_request'")
  expect(source).toContain("const status=action==='reject'?'rejected':'under_review'")
  expect(source.indexOf("if(action!=='money_refund')")).toBeLessThan(source.indexOf('stripe.refunds.create'))
})

test('web organization caller forwards the active workspace header', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/org/refunds/page.tsx'), 'utf8')
  expect(page).toContain("'X-Workspace-ID':workspaceId")
  expect(page).toContain("...workspace")
})
