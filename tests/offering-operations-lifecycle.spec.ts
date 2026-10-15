import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('organization reporting consumes the canonical operations snapshot with workspace isolation', () => {
  const api = read('src/app/api/org/reports/offering-operations/route.ts')
  expect(api).toContain("rpc('org_offering_operations_snapshot'")
  expect(api).toContain('resolveActiveOrganizationId(session.user.id)')
  expect(api).toContain('p_org_id: orgId')
})

test('private lifecycle metrics require server-verified superadmin access', () => {
  const api = read('src/app/api/admin/offering-operations/route.ts')
  expect(api).toContain('requireSuperadminApi(request)')
  expect(api).toContain("rpc('admin_offering_operations_snapshot'")
  expect(read('src/components/AdminSidebar.tsx')).not.toContain('/admin/offering-lifecycle')
})

test('organization offering transitions and permanent deletion use canonical RPCs', () => {
  const api = read('src/app/api/org/offerings/route.ts')
  expect(api).toContain("'set_org_offering_active'")
  expect(api).toContain("'delete_org_offering_if_unused'")
  expect(api).toContain(".eq('org_id',orgId)")
  expect(api).not.toContain("from('programs').delete()")
})

test('protected deletion is explained and lifecycle actions need no cancellation reason', () => {
  const page = read('src/app/org/offerings/[id]/page.tsx')
  expect(page).toContain('protected registration, payment, subscription, refund, credit, or attendance history')
  expect(page).toContain('Make Inactive')
  expect(page).toContain('Activate')
  expect(page).not.toContain('cancellation reason')
})

test('family inventory excludes expired one-time offerings but exempts recurring monthly offerings', () => {
  const storefront = read('src/app/api/mobile/family/storefront/route.ts')
  const prepare = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  for (const source of [storefront, prepare]) {
    expect(source).toContain('renews_until_cancelled')
    expect(source).toContain('billing_interval')
  }
  expect(storefront).toContain('renews_until_cancelled.eq.true,billing_interval.eq.month')
  expect(prepare).toContain('if (!recurringMonthly && program.end_date')
})

test('web registration applies the same expired offering checkout guard', () => {
  const source = read('src/app/api/athlete/org-programs/route.ts')
  expect(source).toContain('const recurringMonthly')
  expect(source).toContain('This program is no longer available for registration.')
})

test('organization metrics include attention, refunds, subscriptions, credits, and legacy exceptions', () => {
  const panel = read('src/components/OfferingOperationsPanel.tsx')
  for (const label of ['Active offerings','Active offerings without future dates','Payment attention','Pending refunds','Outstanding credit liability','Credits expiring within 30 days','Legacy migration exceptions']) expect(panel).toContain(label)
  expect(panel).toContain('No offering lifecycle issues need attention.')
  expect(panel).toContain('/org/refunds?status=pending')
})

test('superadmin metrics include inventory, push failures, refunds, and organization drilldowns', () => {
  const page = read('src/app/admin/offering-lifecycle/page.tsx')
  for (const label of ['Expired offerings left active','Payment exceptions','Refund adjustments needing review','Pending push deliveries','Failed push deliveries','Legacy awaiting verification']) expect(page).toContain(label)
  expect(page).toContain('/admin/orgs/${org.id}?section=offerings')
  expect(page).toContain('No organizations currently need offering lifecycle attention.')
})

test('operational views provide loading, retry, partial-data, and permission states', () => {
  const org = read('src/components/OfferingOperationsPanel.tsx')
  const admin = read('src/app/admin/offering-lifecycle/page.tsx')
  for (const source of [org, admin]) {
    expect(source).toContain('Loading')
    expect(source).toContain('Retry')
  }
  expect(admin).toContain('Partial data')
  expect(admin).toContain('do not have access')
})

test('offering statuses are presented consistently in management', () => {
  const list = read('src/app/org/offerings/page.tsx')
  const detail = read('src/app/org/offerings/[id]/page.tsx')
  for (const status of ['draft','active','closed','cancelled','ended']) expect(list).toContain(`'${status}'`)
  expect(list).toContain("row.status==='closed'?'Inactive':row.status")
  expect(detail).toContain('<option value="published">Active</option>')
  expect(detail).toContain('<option value="closed">Inactive</option>')
})

test('reporting failures are correlated without exposing sensitive database text', () => {
  const org = read('src/app/api/org/reports/offering-operations/route.ts')
  const admin = read('src/app/api/admin/offering-operations/route.ts')
  for (const source of [org, admin]) {
    expect(source).toContain('requestIdFor(request)')
    expect(source).toContain('request_id: requestId')
    expect(source).not.toContain('error.message')
  }
})
