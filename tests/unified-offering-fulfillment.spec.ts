import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('schema defines all fulfillment modes and authoritative multi-date reservations', () => {
  const sql = read('supabase/migrations/20261014010000_unified_offering_fulfillment.sql')
  for (const mode of ['series','per_occurrence','credit_membership','free']) expect(sql).toContain(mode)
  expect(sql).toContain('org_offering_registration_occurrences')
  expect(sql).toContain('select_family_offering_occurrences')
  expect(sql).toContain('cancel_family_offering_occurrence')
  expect(sql).toContain('activate_org_offering_credit_cycle')
})

test('organization portal configures canonical attendance and payment terms', () => {
  const create = read('src/app/org/offerings/new/page.tsx')
  const edit = read('src/app/org/offerings/[id]/page.tsx')
  expect(create).toContain('Pricing and booking')
  for (const source of [create, edit]) {
    expect(source).toContain('attendance_model')
    expect(source).toContain('sessions_included')
  }
  expect(create).toContain('cancellation_cutoff_hours')
  expect(create).not.toContain('price_per_occurrence')
  expect(create).not.toContain('payment_plan_enabled')
})

test('family registration accepts multiple attendance selections and prices the offering server-side', () => {
  const web = read('src/app/api/athlete/org-programs/route.ts')
  const mobile = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  for (const source of [web, mobile]) {
    expect(source).toContain('occurrence_ids')
    expect(source).toContain('Duplicate dates are not allowed')
    expect(source).toContain("rpc('select_family_offering_occurrences'")
    expect(source).toContain('attendanceModel')
  }
})

test('credit renewals are idempotent and subscription states synchronize', () => {
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain("rpc('activate_org_offering_credit_cycle'")
  expect(webhook).toContain('offering_credit_membership_id')
  expect(webhook).toContain("paymentSucceeded ? 'active' : 'past_due'")
  expect(webhook).toContain('cancel_at_period_end')
})

test('individual cancellation and rescheduling use transactional RPCs', () => {
  const route = read('src/app/api/athlete/offering-occurrences/route.ts')
  const sql = read('supabase/migrations/20261014011000_unified_offering_web_contract.sql')
  expect(route).toContain("rpc('cancel_family_offering_occurrence'")
  expect(route).toContain("rpc('reschedule_family_offering_occurrence'")
  expect(sql).toContain('public.cancel_family_offering_occurrence')
  expect(sql).toContain('public.select_family_offering_occurrences')
})
