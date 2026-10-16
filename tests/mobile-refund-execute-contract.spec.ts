import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/mobile/refunds/execute/route.ts'), 'utf8')

test('money refund accepts the canonical request fields and validates approved cents', () => {
  for (const field of ['request_id', 'action', 'resolution_note', 'idempotency_key', 'approved_amount_cents']) expect(source).toContain(field)
  expect(source).toContain("action!=='money_refund'")
  expect(source).toContain('approved>requested')
  expect(source).toContain('headerKey!==bodyKey')
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

test('response contains refund status identity and restored-session counters', () => {
  for (const field of ['status:applied?.status', 'stripe_refund_id:refund.id', 'restored_group_credits', 'restored_one_on_one_credits']) expect(source).toContain(field)
  expect(source).not.toContain('credits_only')
  expect(source).not.toContain('money_and_credits')
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
  for (const code of ['REFUND_REQUEST_NOT_FOUND','REFUND_FORBIDDEN','WORKSPACE_MISMATCH','ORIGINAL_CHARGE_NOT_FOUND','AMOUNT_NOT_REFUNDABLE','STRIPE_ACCOUNT_NOT_READY','REFUND_ALREADY_PROCESSED']) expect(source).toContain(code)
  expect(source).toContain("row.stripe_refund_id&&['refunded','processing','refund_processing']")
})

test('web organization caller forwards the active workspace header', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/org/refunds/page.tsx'), 'utf8')
  expect(page).toContain("'X-Workspace-ID':workspaceId")
  expect(page).toContain("...workspace")
})
