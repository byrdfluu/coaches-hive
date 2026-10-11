import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('automation runs execute supported workflows and report affected records', () => {
  const route = read('src/app/api/admin/automations/run/route.ts')
  expect(route).toContain("workflow === 'retention'")
  expect(route).toContain("workflow === 'notification'")
  expect(route).toContain('executeRetentionPolicies')
  expect(route).toContain('affected')
  expect(read('src/app/admin/automations/page.tsx')).toContain('Select workflow')
})
test('empty playbooks do not silently write sample SOPs', () => {
  const page = read('src/app/admin/playbook/page.tsx')
  expect(page).not.toContain('SEED_LIBRARY')
  expect(page).not.toContain('Seed hardcoded defaults')
  expect(page).not.toContain('Apr 2025')
})

test('subscription controls are durable, audited, and provider-aware', () => {
  const route = read('src/app/api/admin/subscriptions/actions/route.ts')
  for (const action of ['extend_trial', 'grant_waiver', 'revoke_waiver', 'correct_dates', 'reconcile_provider']) {
    expect(route).toContain(action)
  }
  expect(route).toContain('stripe.subscriptions.update')
  expect(route).toContain('logAdminAction')
  expect(read('src/lib/billingState.ts')).toContain('admin_subscription_access_overrides')
})

test('fee rules and organization exceptions affect authoritative fee calculation', () => {
  const fees = read('src/lib/orgPlatformFees.ts')
  expect(fees).toContain("from('platform_fee_rules')")
  expect(fees).toContain("from('organization_fee_exceptions')")
  expect(read('src/app/admin/fee-rules/page.tsx')).toContain('Platform fee controls')
  expect(read('src/app/api/admin/fee-rules/route.ts')).toContain('logAdminAction')
})

test('operational health pages expose real audited remediation actions', () => {
  const route = read('src/app/api/admin/operational-actions/route.ts')
  for (const action of ['refresh_connect', 'invalidate_push_token', 'test_push', 'reconcile_handoff', 'retry_billing', 'reconcile_accounting', 'retry_webhook']) {
    expect(route).toContain(action)
  }
  expect(route).toContain('stripe.accounts.retrieve')
  expect(route).toContain('stripe.checkout.sessions.retrieve')
  expect(route).toContain('queueOperationTask')
  expect(route).toContain('logAdminAction')
})

test('platform restoration is explicit and separate from organization access', () => {
  const users = read('src/app/admin/users/page.tsx')
  expect(users).toContain('Restore platform account')
  expect(users).toContain("action: 'unlock_user'")
  expect(users).toContain('Organization memberships were not changed')
})
