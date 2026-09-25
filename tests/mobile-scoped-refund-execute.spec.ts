import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

const routePath = 'src/app/api/mobile/refunds/execute/route.ts'
const migrationPath = 'supabase/migrations/20260925030000_mobile_scoped_refund_authority.sql'
const refundRequestsPath = 'src/lib/refundRequests.ts'

test('scoped mobile refund route exists and uses shared bearer auth', () => {
  expect(fs.existsSync(path.join(root, routePath))).toBeTruthy()
  const code = read(routePath)
  expect(code).toMatch(/requireMobileUser/)
})

test('scoped mobile refund route rejects platform_subscription and unauthorized callers', () => {
  const code = read(routePath)
  expect(code).toContain("'platform_subscription'")
  expect(code).toContain("mobileError('Forbidden', 403)")
})

test('scoped mobile refund route authorizes by owner column, not a guessed role list', () => {
  const code = read(routePath)
  expect(code).toContain('organization_has_permission')
  expect(code).toContain("row.coach_id === userId")
  expect(code).toContain('is_league_admin')
  expect(code).toContain('league_has_permission')
  expect(code).toContain("p_permission: 'manage_payments'")
})

test('scoped mobile refund route is idempotent and rejects non-refundable states', () => {
  const code = read(routePath)
  expect(code).toContain("['requested', 'under_review', 'approved']")
  expect(code).toContain('row.stripe_refund_id')
  expect(code).toContain("mobileError('Refund request is not in a refundable state', 409)")
})

test('scoped mobile refund route reuses the centralized refund service instead of calling Stripe directly', () => {
  const code = read(routePath)
  expect(code).toContain('approveAndProcessRefundRequest')
  expect(code).not.toContain('stripe.refunds.create')
})

test('scoped mobile refund route logs to the admin audit trail with the real acting role', () => {
  const code = read(routePath)
  expect(code).toContain('recordWorkspaceAdminAudit')
  expect(code).toContain('actingRole')
  expect(code).toContain('scoped_mobile_refund_executed')
})

test('recordWorkspaceAdminAudit no longer hardcodes superadmin as the acting role', () => {
  const code = read('src/lib/workspaceAdmin.ts')
  expect(code).toContain('actingRole?: string')
  expect(code).toContain("input.actingRole || 'superadmin'")
})

test('migration adds owner-scope columns, widens payment_type, and defines the missing league_has_permission function', () => {
  const sql = read(migrationPath)
  expect(sql).toContain('add column if not exists org_id uuid references public.organizations(id)')
  expect(sql).toContain('add column if not exists coach_id uuid references public.profiles(id)')
  expect(sql).toContain('add column if not exists league_id uuid references public.leagues(id)')
  expect(sql).toContain("check (payment_type in ('org_fee','coach_fee','marketplace_order','league_fee'))")
  expect(sql).toContain('create or replace function public.league_has_permission')
  expect(sql).toContain('create trigger assign_refund_request_owner_scope_trigger')
})

test('refundRequests.ts supports league_fee for load and completion', () => {
  const code = read(refundRequestsPath)
  expect(code).toContain("request.payment_type === 'league_fee'")
  expect(code).toContain("from('league_fee_assignments')")
  expect(code).toContain('refunded_cents')
})
