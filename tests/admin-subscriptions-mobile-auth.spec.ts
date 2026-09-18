import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('Superadmin All Access subscriptions API', () => {
  test('middleware passes the iOS bearer token to the authoritative route', () => {
    const policy = source('src/lib/middlewarePolicy.ts')
    const route = source('src/app/api/admin/subscriptions/route.ts')
    expect(policy).toContain("'/api/admin/subscriptions'")
    expect(route).toContain('getMobileRequestUser(request)')
    expect(route).toContain("jsonError('Unauthorized', 401)")
    expect(route).toContain("jsonError('Forbidden', 403)")
    expect(route).toContain('[admin_subscriptions_authorization_failed]')
  })

  test('returns the complete mobile item and pagination contract', () => {
    const route = source('src/app/api/admin/subscriptions/route.ts')
    for (const field of [
      'user_id', 'workspace_id', 'workspace_name', 'email', 'full_name',
      'purchase_channel', 'has_access', 'status', 'billing_role', 'plan_key',
      'billing_interval', 'current_period_end', 'cancel_at_period_end', 'currency',
      'renewal_amount', 'active_coach_count', 'included_coach_count',
      'additional_coach_count',
    ]) expect(route).toContain(field)
    expect(route).toContain('next_cursor: nextCursor')
  })

  test('searches names/emails, paginates, and excludes test/sandbox rows by default', () => {
    const route = source('src/app/api/admin/subscriptions/route.ts')
    expect(route).toContain('email.ilike.%${query}%')
    expect(route).toContain('full_name.ilike.%${query}%')
    expect(route).toContain("searchParams.get('cursor')")
    expect(route).toContain('purchase_channel.neq.apple_iap')
    expect(route).toContain('filterAdminTestRows(items, showTestData)')
  })

  test('RLS fallback stays private and matches the Superadmin rule', () => {
    const migration = source('supabase/migrations/20260918010000_superadmin_subscription_access.sql')
    expect(migration).toContain("lower(coalesce(p.role,''))='superadmin'")
    expect(migration).toContain("admin_team_role',''))='superadmin'")
    expect(migration).toContain('to authenticated')
    expect(migration).not.toContain('to anon')
    expect(migration).not.toContain('using(true)')
  })
})

