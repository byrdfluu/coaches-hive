import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('test-data migration preserves audited classification contracts', () => {
  const sql = source('supabase/migrations/20260809030000_test_data_classification.sql')
  for (const table of ['profiles', 'athlete_profiles', 'organizations', 'business_workspaces']) {
    expect(sql).toContain(`alter table public.${table}`)
  }
  expect(sql).toContain('admin_set_user_test_status')
  expect(sql).toContain('admin_set_organization_test_status')
  expect(sql).toContain('admin_audit_log')
  expect(sql).toContain('livemode=true')
})

test('superadmin classification uses audited RPCs and hides test data by default', () => {
  const route = source('src/app/api/admin/test-data/route.ts')
  const helper = source('src/lib/adminTestData.ts')
  expect(route).toContain("'admin_set_user_test_status'")
  expect(route).toContain("'admin_set_organization_test_status'")
  expect(route).toContain('p_reason')
  expect(helper).toContain("params.get('show_test_data') === 'true'")
  expect(helper).toContain('classified.filter(row => !row.is_test)')
})

test('production revenue continues requiring live Stripe accounting', () => {
  expect(source('src/app/api/admin/revenue/route.ts')).toContain(".eq('livemode', true)")
  expect(source('src/app/api/admin/insights/route.ts')).toContain(".eq('livemode', true)")
  expect(source('src/app/api/admin/metrics/route.ts')).toContain(".eq('livemode', true)")
})
