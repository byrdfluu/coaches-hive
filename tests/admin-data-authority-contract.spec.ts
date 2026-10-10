import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('admin athlete rows keep actions outside the selectable row control', () => {
  const page = source('src/app/admin/athletes/page.tsx')
  expect(page).toContain('role="button"')
  expect(page).toContain('tabIndex={0}')
  expect(page).not.toContain('<button\n                        type="button"\n                        key={athlete.id}')
})

test('admin people metrics include paginated and multi-role auth users', () => {
  const metrics = source('src/app/api/admin/metrics/route.ts')
  const athletes = source('src/app/api/admin/athletes/route.ts')
  const coaches = source('src/app/api/admin/coaches/route.ts')

  expect(metrics).toContain('listUsers({ page, perPage: 200 })')
  expect(metrics).toContain('getSessionRoleState(user.user_metadata).availableRoles')
  expect(athletes).toContain("availableRoles.includes('athlete')")
  expect(coaches).toContain('availableRoles.some')
})

test('verification queue tolerates optional production schema columns', () => {
  const route = source('src/app/api/admin/verifications/route.ts')
  expect(route.match(/\.select\('\*'\)/g)?.length || 0).toBeGreaterThanOrEqual(3)
})

test('admin data views hide classified test records by default', () => {
  const pages = [
    'src/app/admin/page.tsx',
    'src/app/admin/users/page.tsx',
    'src/app/admin/athletes/page.tsx',
    'src/app/admin/orgs/page.tsx',
    'src/app/admin/workspaces/page.tsx',
    'src/app/admin/subscriptions/page.tsx',
    'src/app/admin/orders/page.tsx',
    'src/app/admin/revenue/page.tsx',
    'src/app/admin/support/page.tsx',
    'src/app/admin/system-health/page.tsx',
  ]

  for (const path of pages) {
    expect(source(path), path).toContain('const [showTestData, setShowTestData] = useState(false)')
  }

  for (const path of ['src/app/admin/programs/page.tsx', 'src/app/admin/tryouts/page.tsx']) {
    expect(source(path), path).toContain('const [showTest, setShowTest] = useState(false)')
  }

  expect(source('src/app/admin/insights/page.tsx')).toContain("useState<Record<string, string>>({})")
})

test('governance explains that dead-letter Slack events require an explicit retry', () => {
  const page = source('src/app/admin/governance/page.tsx')
  const route = source('src/app/api/admin/governance/route.ts')
  expect(page).toContain('These will not retry automatically.')
  expect(page).toContain('Delivery runs every five minutes.')
  expect(route).toContain("const { data, error } = await supabase.rpc('admin_retry_slack_events')")
  expect(route).not.toContain("supabaseAdmin.rpc('admin_retry_slack_events')")
  expect(route).toContain('provider_message: error.message')
})
