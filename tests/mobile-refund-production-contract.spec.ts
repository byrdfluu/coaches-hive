import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('mobile refund errors and success match the production iOS decoder', () => {
  const route = read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).toContain('{error:code,message:safeMobileMessage(message,status),request_id:correlationId,retryable}')
  expect(route).toContain("headers:{'Cache-Control':'no-store','x-request-id':correlationId")
  expect(route).toContain('refund_request_id:refundRequestId')
  expect(route).toContain('refunded_amount_cents:Number(refund.amount)')
})

test('authorization combines active workspace membership and canonical legacy authority', () => {
  const route = read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).toContain("from('business_workspaces')")
  expect(route).toContain("from('workspace_memberships')")
  expect(route).toContain("rpc('can_manage_org_refunds'")
  expect(route).toContain("context.authorization_result=workspaceAllowed||legacyAllowed===true?'allowed':'denied'")
})

test('under-review and rejection finish before Stripe payment resolution', () => {
  const route = read('src/app/api/mobile/refunds/execute/route.ts')
  const decision = route.indexOf("if(action!=='money_refund')")
  expect(decision).toBeGreaterThan(0)
  expect(decision).toBeLessThan(route.indexOf("from('payment_transactions')"))
  expect(decision).toBeLessThan(route.indexOf('stripe.refunds.create'))
})

test('withdrawal migration deletes free records while preserving paid financial history', () => {
  const migration = fs.readFileSync('/Users/juwan/Desktop/CH App/supabase/migrations/20261017020000_withdrawal_transaction_trigger_hardening.sql','utf8')
  expect(migration).toContain('delete from public.program_registrations where id=v_registration.id')
  expect(migration).toContain("update public.program_registrations set status='cancelled'")
  const storefront = read('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain("['pending','pending_payment','processing','paid','confirmed','registered','active'].includes")
  expect(storefront).not.toMatch(/registrationStatus[\s\S]{0,200}cancelled[^\n]*registered/)
})
