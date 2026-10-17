import {expect,test} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(),read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

test('credit restoration is immutable idempotent and capped by original cycle grants',()=>{
  const sql=read('supabase/migrations/20261003070000_organization_refund_credit_resolutions.sql')
  expect(sql).toContain('refund_credit_restorations')
  expect(sql).toContain('refund_request_id uuid not null unique')
  expect(sql).toContain('prevent_refund_credit_restoration_mutation')
  expect(sql).toContain('Requested credits exceed the original grant')
  expect(sql).toContain("reason='refund_credit_restoration'")
  expect(sql).toContain('billing_cycle_key')
})

test('organization refund execution exposes one money refund action',()=>{
  const route=read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).toContain('money_refund')
  expect(route).not.toContain('credits_only')
  expect(route).not.toContain('money_and_credits')
  expect(route).toContain("parseUuid(request.headers.get('idempotency-key'))")
  expect(route).toContain("rpc('apply_offering_refund_result'")
  expect(route).toContain('refunded_amount_cents:Number(refund.amount)')
  expect(route).not.toContain('restored_group_credits')
  expect(route).not.toContain('restored_one_on_one_credits')
})

test('refund attribution distinguishes ledger transaction from source payment record',()=>{
  const migration=read('supabase/migrations/20261003080000_refund_execution_idempotency_and_attribution.sql')
  const familyRoute=read('src/app/api/mobile/refunds/route.ts')
  expect(migration).toContain('payment_transaction_id uuid references public.payment_transactions')
  expect(migration).toContain('organization_id uuid references public.organizations')
  expect(migration).not.toContain('request.org_id')
  expect(migration).not.toContain('r.org_id')
  expect(migration).toContain('refund_resolution_attempts')
  expect(familyRoute).toContain('payment_transaction_id:tx.id')
  expect(familyRoute).toContain('payment_record_id:refundRecordId')
  expect(read('src/lib/refundRequests.ts')).toContain('request.payment_transaction_id?query.eq')
})

test('family refund listing exposes organization resolution and receipt details',()=>{
  const route=read('src/app/api/mobile/refunds/route.ts')
  for(const field of ['organization_name','requested_amount_cents','refunded_amount_cents','restored_group_credits','restored_one_on_one_credits','resolution_note','requested_at','resolved_at','receipt_url'])expect(route).toContain(field)
})

test('mobile payment return route opens the app without claiming webhook fulfillment',()=>{
  const page=read('src/app/mobile/payment-return/MobilePaymentReturn.tsx')
  expect(page).toContain('coacheshive://payment-complete')
  expect(page).toContain('being securely confirmed')
  expect(page).toContain('Open Coaches Hive')
  expect(page).not.toContain('Your purchase is active')
})

test('credit-only actions are not exposed',()=>{
  const route=read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).not.toContain('credits_only')
  expect(route).not.toContain('money_and_credits')
})

test('superadmin retains read-only organization refund visibility',()=>{
  const route=read('src/app/api/admin/refunds/route.ts')
  expect(route).toContain("previousRequest.payment_type !== 'platform_subscription'")
  expect(route).toContain('Organization refunds are read-only here')
})

test('recurring storefront suppresses renewal date after scheduled cancellation',()=>{
  const storefront=read('src/app/api/mobile/family/storefront/route.ts')
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  expect(storefront).toContain('cancel_at_period_end')
  expect(storefront).toContain('cancellation_effective_date')
  expect(storefront).toContain('next_billing_date: cancelAtPeriodEnd ? null')
  expect(webhook).toContain('cancel_at_period_end: Boolean(subscription.cancel_at_period_end)')
})
