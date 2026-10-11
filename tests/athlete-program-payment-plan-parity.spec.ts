import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('organization program API exposes the payment plan fields used by iOS', () => {
  const route = source('src/app/api/athlete/org-programs/route.ts')

  for (const field of [
    'payment_plan_enabled',
    'payment_plan_installments',
    'payment_plan_frequency',
    'payment_plan_first_payment_cents',
  ]) expect(route).toContain(field)
})

test('web enrollment uses the canonical family payment plan RPC and first installment', () => {
  const route = source('src/app/api/athlete/org-programs/route.ts')

  expect(route).toContain("supabase.rpc('enroll_program_payment_plan'")
  expect(route).toContain(".from('family_payment_plan_installments')")
  expect(route).toContain("checkout_type: 'installment'")
  expect(route).toContain('checkout_record_id: installment.id')
})

test('athlete program UI offers installment checkout with idempotency', () => {
  const page = source('src/app/athlete/programs/page.tsx')

  expect(page).toContain('Pay in installments')
  expect(page).toContain("'Idempotency-Key': idempotencyKey")
  expect(page).toContain('idempotency_key: idempotencyKey')
  expect(page).toContain("type: payload.checkout_type || 'program'")
  expect(page).toContain('payload.checkout_record_id || payload.registration.id')
})
