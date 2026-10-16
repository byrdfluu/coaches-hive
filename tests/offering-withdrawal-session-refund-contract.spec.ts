import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('creation exposes only the three supported attendance models', () => {
  const page = read('src/app/org/offerings/new/page.tsx')
  for (const model of ['free', 'fixed_enrollment', 'monthly_session_membership']) expect(page).toContain(model)
  expect(page).not.toContain("['prepaid_session_pack','Prepaid session pack']")
  expect(page).not.toContain("id:'pack'")
})

test('historical prepaid packs remain visible but cannot be created or selected', () => {
  const page = read('src/app/org/offerings/[id]/page.tsx')
  const route = read('src/app/api/org/offerings/route.ts')
  expect(page).toContain('Historical prepaid session pack')
  expect(page).toContain('disabled')
  expect(route).toContain("creatableAttendanceModels=new Set(['free','fixed_enrollment','monthly_session_membership'])")
  expect(route).toContain('Prepaid session packs can no longer be created.')
  expect(route).toContain('attendance_model:model,sessions_included:sessions')
  expect(route).toContain('credit_expiration_days:expiration')
})

test('family session balances and history use the canonical RPCs', () => {
  const route = read('src/app/api/athlete/credits/route.ts')
  const page = read('src/app/athlete/credits/page.tsx')
  expect(route).toContain("rpc('my_session_balances'")
  expect(route).toContain("rpc('my_session_history'")
  expect(route).not.toContain("rpc('my_credit_balances'")
  for (const field of ['org_name', 'product_name', 'credit_type', 'credits_remaining', 'next_expiration', 'reason', 'occurred_at']) expect(page).toContain(field)
})

test('entire enrollment withdrawal is canonical and separate from refunds and subscriptions', () => {
  const route = read('src/app/api/athlete/org-programs/route.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(route).toContain("rpc('withdraw_family_program_registration'")
  expect(page).toContain('Withdraw Entire Enrollment')
  expect(page).toContain('does not automatically refund payment')
  expect(page).toContain('Monthly renewal must be stopped separately')
})

test('refund creation links organization payment and returns the persisted row', () => {
  const route = read('src/app/api/mobile/refunds/route.ts')
  expect(route).toContain('org_id:tx.org_id')
  expect(route).toContain('payment_transaction_id:tx.id')
  expect(route).toContain('payment_record_id:refundRecordId')
  expect(route).toContain('refund_request:linked')
  expect(route).toContain("eq('requester_id',user.id)")
  expect(read('src/app/api/mobile/refunds/execute/route.ts')).toContain("query=query.eq('org_id',workspace.organization_id)")
})

test('organization payments prominently links to pending refund review', () => {
  expect(read('src/app/org/payments/page.tsx')).toContain('Review Refund Requests')
  const refunds = read('src/app/org/refunds/page.tsx')
  expect(refunds).toContain("await load()")
})
