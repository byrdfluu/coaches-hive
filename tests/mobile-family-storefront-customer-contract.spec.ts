import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('storefront exposes the canonical athlete-specific customer contract', () => {
  const route = read('src/app/api/mobile/family/storefront/route.ts')
  for (const status of ['available','ineligible','pending_payment','processing','purchased','registered','active_subscription','sold_out','registration_closed','canceled','refunded','partially_refunded']) {
    expect(route).toContain(status)
  }
  for (const field of ['location','purchase_limit','included_per_cycle','first_charge_date','next_billing_date','cancellation_terms','credits_roll_over','refund_policy']) {
    expect(route).toContain(field)
  }
  expect(route).toContain(".eq('athlete_profile_id', athlete.profileId)")
  expect(route).toContain(".eq('athlete_id', athlete.profileId)")
  expect(route).toContain("status:programStatus")
  expect(route).not.toContain("status:'published'")
  expect(route).not.toContain("status:'active'")
})

test('published fee validation requires an eligible plan and ready Connect account', () => {
  const route = read('src/app/api/org/charges/route.ts')
  expect(route).toContain("publicationStatus === 'published'")
  expect(route).toContain("loadStripeConnectAccountStatus('org', orgId, { refresh: true })")
  expect(route).toContain('isStripeConnectEnabled(connect)')
  expect(route).toContain('isOrgPlanActive')
})

test('customer terms migration is additive and constrained', () => {
  const migration = read('supabase/migrations/20261002100000_family_storefront_customer_contract.sql')
  for (const table of ['programs','org_tryouts','sessions','org_training_packages','marketplace_items','org_fees','organization_recurring_fee_offers']) {
    expect(migration).toContain(`'${table}'`)
  }
  expect(migration).toContain('purchase_limit is null or purchase_limit > 0')
  expect(migration).toContain('included_per_cycle is null or included_per_cycle > 0')
})
