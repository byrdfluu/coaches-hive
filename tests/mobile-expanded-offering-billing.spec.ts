import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('single-team Connect Dashboard is mode- and workspace-scoped', () => {
  const route = read('src/app/api/mobile/connect/dashboard/route.ts')
  expect(route).toContain("workspace.type === 'independent_coach'")
  expect(route).toContain('teamManagementEnabled(coachProfile.mode)')
  expect(route).toContain("workspaceCan(workspace, 'manage_payments')")
  expect(route).toContain(".select('stripe_account_id,workspace_id')")
  expect(route).toContain('stripe_workspace_mismatch')
  expect(route).toContain('stripe.accounts.createLoginLink')
})

test('family storefront exposes canonical billing and checkout contracts', () => {
  const route = read('src/app/api/mobile/family/storefront/route.ts')
  expect(route).toContain('billing_type: OfferingBillingType')
  expect(route).toContain("billing.billingType==='recurring'?'recurring_offering'")
  expect(route).toContain('new Map(offerings.map(item=>[item.offering_id,item]))')
  expect(route).toContain('categories,offerings:canonicalOfferings')
})

test('program and tryout registration preparation is server-authorized', () => {
  const route = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  expect(route).toContain('resolveAuthorizedAthleteContext')
  expect(route).toContain("rpc('is_org_program_visible'")
  expect(route).toContain("from('program_registrations')")
  expect(route).toContain("from('org_tryout_registrations')")
  expect(route).toContain("'recurring_offering'")
})

test('recurring offering checkout is Connect and webhook authoritative', () => {
  const route = read('src/app/api/mobile/offerings/recurring-checkout/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(route).toContain("mode: 'subscription'")
  expect(route).toContain("source: 'recurring_offering'")
  expect(route).toContain('subscription_data:')
  expect(route).toContain('idempotencyKey: `recurring-offering:')
  expect(webhook).toContain('syncRecurringOfferingSubscription')
  expect(webhook).toContain("metadata.source === 'recurring_offering'")
  expect(webhook).toContain("status: 'expired'")
})

test('migration preserves legacy behavior and validates recurring combinations', () => {
  const sql = read('supabase/migrations/20261002010000_expand_family_offering_billing.sql')
  expect(sql).toContain("then 'one_time' else 'free'")
  expect(sql).toContain("billing_type = 'recurring' and billing_interval in ('month','year')")
  expect(sql).toContain('offering_recurring_subscriptions')
  expect(sql).toContain('offering_recurring_active_uidx')
})
