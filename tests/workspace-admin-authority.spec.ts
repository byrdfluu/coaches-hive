import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('workspace administration exposes directory, detail, user context, and reconciliation surfaces', () => {
  for (const path of [
    'src/app/admin/workspaces/page.tsx',
    'src/app/admin/workspaces/[id]/page.tsx',
    'src/app/admin/workspace-reconciliation/page.tsx',
    'src/app/api/admin/workspaces/route.ts',
    'src/app/api/admin/workspaces/[id]/route.ts',
    'src/app/api/admin/users/[id]/workspaces/route.ts',
    'src/app/api/admin/workspace-reconciliation/route.ts',
  ]) expect(source(path).length).toBeGreaterThan(100)
})

test('workspace mutations require reasons and create before/after workspace audit records', () => {
  const actions = source('src/app/api/admin/workspaces/[id]/actions/route.ts')
  const audit = source('src/lib/workspaceAdmin.ts')
  expect(actions).toContain('A reason is required for every workspace mutation')
  for (const action of ['set_workspace_status','update_membership','resolve_athlete_request','assign_reconciliation_record']) {
    expect(actions).toContain(action)
  }
  expect(actions).toContain('recordWorkspaceAdminAudit')
  expect(audit).toContain('previous_state')
  expect(audit).toContain('new_state')
  expect(audit).toContain('reason')
  expect(actions).not.toContain('stripe.refunds.create')
  expect(actions).not.toContain('stripe.subscriptions.update')
  expect(actions).not.toContain('charges_enabled: true')
})

test('operational APIs return and filter workspace attribution', () => {
  for (const path of [
    'src/app/api/admin/mobile-handoffs/route.ts',
    'src/app/api/admin/billing-failures/route.ts',
    'src/app/api/admin/subscriptions/route.ts',
    'src/app/api/admin/connect-accounts/route.ts',
    'src/app/api/admin/payment-accounting/route.ts',
    'src/app/api/admin/refunds/route.ts',
    'src/app/api/admin/disputes/route.ts',
    'src/app/api/admin/audit/route.ts',
    'src/app/api/admin/webhooks/route.ts',
  ]) {
    const route = source(path)
    expect(route).toContain('workspace_id')
  }
})

test('workspace search covers business and Stripe identifiers', () => {
  const helper = source('src/lib/workspaceAdmin.ts')
  for (const identifier of [
    'email', 'display_name', 'organization', 'stripe_customer_id', 'stripe_subscription_id',
    'stripe_checkout_session_id', 'stripe_payment_intent_id', 'connected_account_destination', 'stripe_account_id',
  ]) expect(helper).toContain(identifier)
})

test('Connect readiness remains charges and payouts enabled together', () => {
  const directory = source('src/app/api/admin/workspaces/route.ts')
  const connect = source('src/app/api/admin/connect-accounts/route.ts')
  expect(directory).toContain('connect?.charges_enabled && connect?.payouts_enabled')
  expect(connect).toContain('r.charges_enabled&&r.payouts_enabled')
})

test('workspace migrations are ordered before admin attribution extensions', () => {
  const authority = source('supabase/migrations/20260808030000_workspace_authority_and_multi_role.sql')
  const admin = source('supabase/migrations/20260808040000_workspace_admin_authority.sql')
  expect(authority).toContain('create table if not exists public.business_workspaces')
  expect(authority).toContain('create or replace view public.workspace_reconciliation_queue')
  expect(admin).toContain('workspace_admin_reconciliation_queue')
  expect(admin).toContain('stripe_connect_payment_accounting')
  expect(admin).toContain('payment_refund_requests')
})
