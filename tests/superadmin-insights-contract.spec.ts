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
  expect(health).toContain('Payment readiness')
  expect(`${insights}\n${health}`).not.toMatch(/mark paid|mark refunded|activate subscription|complete connect/i)
  expect(lifecycle).toContain('can_delete')
  expect(lifecycle).toContain('p_confirmation')
})

test('insights derive every visible total from the same authoritative filtered rows', () => {
  const route = read('src/app/api/admin/insights/route.ts')
  const page = read('src/app/admin/insights/page.tsx')
  const programs = read('src/app/admin/programs/page.tsx')
  const tryouts = read('src/app/admin/tryouts/page.tsx')
  const programsApi = read('src/app/api/admin/programs/route.ts')
  const tryoutsApi = read('src/app/api/admin/tryouts/route.ts')
  expect(route).not.toContain("supabase.rpc('admin_insights_summary')")
  expect(route).toContain(".eq('livemode', true)")
  expect(route).toContain("channel === 'apple' ? 'apple_iap' : channel")
  expect(route).toContain('refunded_amount_cents')
  expect(route).toContain('accounts: profileRows.length')
  expect(route).toContain("workspaceRows.filter((row: any) => row.status === 'active').length")
  expect(page).toContain("show_test_data: 'true'")
  expect(page).toContain('value="mobile_program"')
  expect(page).toContain('value="org_fee"')
  expect(programs).toContain('<Fragment key={p.id}>')
  expect(tryouts).toContain('<Fragment key={t.id}>')
  expect(programs).toContain('useState(true)')
  expect(tryouts).toContain('useState(true)')
  expect(programsApi).toContain("from('organizations').select('id, name, is_test')")
  expect(tryoutsApi).toContain("from('organizations').select('id, name, is_test')")
})

test('exports are server generated, authorized, audited, paginated, and expiring', () => {
  const route = read('src/app/api/admin/exports/route.ts')
  const migration = read('supabase/migrations/20260808051000_superadmin_export_jobs.sql')
  expect(route).toContain('requireSuperadminApi')
  expect(route).toContain("admin.export.created")
  expect(route).toContain('.range(offset, offset + 999)')
  expect(migration).toContain('expires_at')
})

test('Apple IAP readiness matches the production transaction verifier', () => {
  const settings = read('src/app/api/admin/settings/route.ts')
  const verifier = read('src/lib/appleIap.ts')
  for (const key of ['APPLE_APP_ID', 'APPLE_ROOT_CERTIFICATES_BASE64', 'APPLE_IAP_ENVIRONMENTS']) {
    expect(settings).toContain(key)
    expect(verifier).toContain(key)
  }
  expect(settings).toContain('APPLE_BUNDLE_ID')
  expect(settings).not.toContain("boolEnv('APPLE_IAP_ISSUER_ID')")
})
