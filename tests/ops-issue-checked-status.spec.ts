import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('ops issue migration supports open checked and resolved with audit history', () => {
  const sql = source('supabase/migrations/20260809040000_ops_issue_checked_status.sql')
  expect(sql).toContain("check (status in ('open', 'checked', 'resolved'))")
  expect(sql).toContain('admin_set_ops_issue_status')
  expect(sql).toContain('checked_by')
  expect(sql).toContain('checked_at')
  expect(sql).toContain('admin_audit_log')
})

test('Stripe reconciliation is review-only and exposes separate histories', () => {
  const api = source('src/app/api/admin/stripe-reconciliation/route.ts')
  const page = source('src/app/admin/stripe-reconciliation/page.tsx')
  expect(api).toContain("p_category: 'Payments'")
  expect(api).toContain("p_status: status")
  expect(api).toContain('financial_state_changed: false')
  expect(api).toContain("row.review_status === 'open'")
  for (const label of ['Mark Checked','Mark Resolved','Reopen','Checked History','Resolved History']) expect(page).toContain(label)
})

test('overview access comes only from authoritative subscriptions', () => {
  const metrics = source('src/app/api/admin/metrics/route.ts')
  const users = source('src/app/api/admin/users/route.ts')
  const overview = source('src/app/admin/page.tsx')
  expect(metrics).toContain(".in('status',['active','trialing'])")
  expect(metrics).toContain('orgsWithAccess.size')
  expect(users).toContain("subscriptionStatus === 'active' ? 'Active'")
  expect(users).toContain("subscriptionStatus === 'trialing' ? 'Trialing' : 'Registered'")
  expect(users).toContain("'organization_workspace'")
  expect(overview).toContain('Orgs with Access')
})
