import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('shared migration adds canonical organization discovery fields without a competing ledger', () => {
  const migration = source('supabase/migrations/20260824010000_location_sport_discovery.sql')
  for (const field of ['sport_primary', 'sports_additional', 'city', 'state', 'zip_code']) expect(migration).toContain(field)
  expect(migration).toContain("notify pgrst, 'reload schema'")
  expect(migration).not.toContain('create table')
  expect(source('src/app/api/public/orgs/route.ts')).toContain('sport_primary, sports_additional, city, state, zip_code')
})

test('all portal settings expose the shared billing summary', () => {
  for (const page of ['athlete', 'coach', 'org']) {
    expect(source(`src/app/${page}/settings/page.tsx`)).toContain('<PortalBillingSummary />')
  }
  const route = source('src/app/api/account/billing-summary/route.ts')
  expect(route).toContain('Athlete & Family Access')
  expect(route).toContain('Organization-Sponsored Coach')
  expect(route).toContain('getPlatformSubscriptionSnapshot')
  expect(route).toContain('cancel_at_period_end')
})

test('independent coach subscriptions take precedence over organization sponsorship', () => {
  const resolver = source('src/lib/platformSubscription.ts')
  const independentCheck = "String(profile?.role || '') === 'coach' && personalSubscription"
  expect(resolver).toContain(independentCheck)
  expect(resolver.indexOf(independentCheck)).toBeLessThan(resolver.indexOf('const membershipIsActive'))
})

test('athlete discovery keeps primary filters and ranks canonical organization location', () => {
  const page = source('src/app/athlete/discover/page.tsx')
  for (const filter of ["'All'", "'Coaches'", "'Organizations'"]) expect(page).toContain(filter)
  expect(page).toContain('org.sports_additional')
  expect(page).toContain('proximityRank')
  expect(page).toContain('athleteLocation.zip_code === org.zip_code')
})

test('athlete settings link directly to all mobile-parity destinations', () => {
  const page = source('src/app/athlete/settings/page.tsx')
  for (const path of ['/athlete/payments', '/athlete/memberships', '/athlete/marketplace', '/athlete/marketplace/orders', '/athlete/programs', '/athlete/tryouts']) expect(page).toContain(path)
})

test('superadmin uses five permanent tabs and exposes all workflows in Control Center', () => {
  const sidebar = source('src/components/AdminSidebar.tsx')
  for (const label of ['Overview', 'Operations', 'Revenue', 'Users', 'Settings']) expect(sidebar).toContain(`label: '${label}'`)
  const center = source('src/app/admin/control-center/page.tsx')
  for (const route of ['/admin/subscriptions', '/admin/payment-accounting', '/admin/programs', '/admin/refunds', '/admin/disputes', '/admin/payouts', '/admin/orders', '/admin/orgs', '/admin/users', '/admin/support', '/admin/system-health', '/admin/reviews', '/admin/verifications', '/admin/audit']) expect(center).toContain(route)
})

test('canonical payment response is integer cents, idempotent, and webhook-pending', () => {
  const service = source('src/lib/canonicalPaymentIntent.ts')
  for (const field of ['transaction_id', 'amount_cents', 'platform_fee_cents', 'stripe_processing_fee_cents', 'net_cents', 'processing_fee_rate']) expect(service).toContain(field)
  expect(service).toContain("status: 'pending'")
  expect(service).toContain('idempotencyKey')
})
