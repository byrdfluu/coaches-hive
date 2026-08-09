import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('web and mobile share the superadmin insights RPC contract', () => {
  const sql = read('supabase/migrations/20260808050000_superadmin_insights_and_safe_actions.sql')
  for (const contract of ['admin_insights_summary','admin_organization_engagement','admin_system_failure_feed','admin_set_ops_issue_resolution','admin_archive_organization','admin_delete_empty_test_organization']) expect(sql).toContain(contract)
  expect(sql).toContain("'gross_volume_cents'")
  expect(sql).toContain("'platform_fee_cents'")
  expect(sql).toContain("'seller_net_cents'")
})

test('admin surfaces drilldowns without financial completion controls', () => {
  const insights = read('src/app/admin/insights/page.tsx')
  const health = read('src/app/admin/system-health/page.tsx')
  const lifecycle = read('src/app/api/admin/orgs/[id]/lifecycle/route.ts')
  expect(insights).toContain('Gross payment volume')
  expect(insights).toContain('Coaches Hive revenue')
  expect(insights).toContain('PaymentIntent ID')
  expect(health).toContain('financial state')
  expect(`${insights}\n${health}`).not.toMatch(/mark paid|mark refunded|activate subscription|complete connect/i)
  expect(lifecycle).toContain('can_delete')
  expect(lifecycle).toContain('p_confirmation')
})

test('exports are server generated, authorized, audited, paginated, and expiring', () => {
  const route = read('src/app/api/admin/exports/route.ts')
  const migration = read('supabase/migrations/20260808051000_superadmin_export_jobs.sql')
  expect(route).toContain('requireSuperadminApi')
  expect(route).toContain("admin.export.created")
  expect(route).toContain('.range(offset, offset + 999)')
  expect(migration).toContain('expires_at')
})
