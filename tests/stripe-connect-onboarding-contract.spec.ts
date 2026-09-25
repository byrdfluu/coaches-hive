import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('mobile Connect onboarding uses HTTPS universal links and incremental collection', () => {
  const route = source('src/app/api/mobile/connect/start/route.ts')
  expect(route).toContain("url.protocol !== 'https:'")
  expect(route).toContain("url.hostname !== 'app.coacheshive.com'")
  expect(route).toContain("url.pathname !== '/open-app'")
  expect(route).toContain("type: 'account_onboarding'")
  expect(route).toContain("fields: 'currently_due'")
  expect(route).toContain("future_requirements: 'omit'")
  expect(route).toContain('return_url: verifiedReturnUrl')
  expect(route).toContain("refreshUrl.searchParams.set('from', '/connect-updated?stripe=refresh')")
})

test('Connect account creation is Express, capability-scoped, and idempotent', () => {
  const accounts = source('src/lib/stripeConnectAccounts.ts')
  expect(accounts).toContain("type: 'express'")
  expect(accounts).toContain('card_payments: { requested: true }')
  expect(accounts).toContain('transfers: { requested: true }')
  expect(accounts).toContain('idempotencyKey: `connect-account:')
  expect(accounts).not.toContain("{ refresh: true }).catch(() => null)")
  expect(accounts).toContain("upsert(payload, { onConflict: 'owner_type,owner_id' })")
})

test('organization and league authority is verified before account creation', () => {
  const route = source('src/app/api/mobile/connect/start/route.ts')
  expect(route.indexOf('resolveOrgMembership')).toBeLessThan(route.indexOf('createOrReuseStripeConnectAccount(ownerType'))
  expect(route).toContain("membership.role === 'league_admin'")
  expect(route).toContain('permissions.manage_payments === true')
  expect(route).toContain("workspaceCan(workspace, 'manage_connect')")
})

test('webhooks synchronize the complete connected-account readiness state', () => {
  const webhook = source('src/app/api/stripe/connect-webhook/route.ts')
  const accounts = source('src/lib/stripeConnectAccounts.ts')
  expect(webhook).toContain("event.type === 'account.updated'")
  expect(webhook).toContain('syncStripeConnectAccountByStripeId')
  for (const field of ['charges_enabled', 'payouts_enabled', 'details_submitted', 'requirements_due', 'disabled_reason', 'connect_status']) {
    expect(accounts).toContain(field)
  }
})

test('checkout and publishing require complete Stripe readiness', () => {
  const accounts = source('src/lib/stripeConnectAccounts.ts')
  expect(accounts).toContain('status.chargesEnabled && status.payoutsEnabled && status.detailsSubmitted')
  for (const route of [
    'src/app/api/mobile/checkout/route.ts',
    'src/app/api/payments/intent/route.ts',
    'src/app/api/org/products/route.ts',
    'src/app/api/org/products/[id]/route.ts',
    'src/app/api/org/marketplace/products/bulk/route.ts',
  ]) {
    expect(source(route), route).toContain('isStripeConnectEnabled')
  }
})

test('mobile Connect errors expose a safe message and request identifier', () => {
  const route = source('src/app/api/mobile/connect/start/route.ts')
  expect(route).toContain('request_id: requestId')
  expect(route).toContain("'x-request-id': requestId")
  expect(route).toContain('safeErrorMessage')
  expect(route).not.toContain("jsonError(error?.message || 'Unable to start Stripe Connect onboarding', 500)")
})
