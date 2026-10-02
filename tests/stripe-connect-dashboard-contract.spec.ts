import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

test('mobile Connect dashboard route derives its Stripe account from the authorized workspace', () => {
  const route = source('src/app/api/mobile/connect/dashboard/route.ts')

  expect(route).toContain('authorizeWorkspaceRequest({ request, userId: user.id, body })')
  expect(route).toContain("workspace.type === 'organization'")
  expect(route).toContain("workspaceCan(workspace, 'manage_connect')")
  expect(route).toContain("workspaceCan(workspace, 'manage_payments')")
  expect(route).toContain("loadStripeConnectAccountStatus(ownerType, ownerId, { refresh: true })")
  expect(route).not.toMatch(/body\?\.(stripe_account_id|account_id)/)
})

test('mobile Connect dashboard route creates a single-use Stripe-hosted login link', () => {
  const route = source('src/app/api/mobile/connect/dashboard/route.ts')

  expect(route).toContain('stripe.accounts.createLoginLink(account.stripeAccountId)')
  expect(route).toContain('assertStripeHostedUrl(loginLink.url)')
  expect(route).toContain("{ dashboard_url: dashboardUrl }")
  expect(route).toContain("'Cache-Control': 'no-store'")
  expect(route).toContain("enforcePaymentRateLimit(user.id, 'connect_dashboard'")
  expect(route).toContain("action: 'connect_dashboard_link_created'")
})

test('mobile Connect dashboard route returns safe customer-facing errors', () => {
  const route = source('src/app/api/mobile/connect/dashboard/route.ts')

  expect(route).toContain("'stripe_connect_not_configured'")
  expect(route).toContain("'stripe_environment_mismatch'")
  expect(route).toContain("'stripe_dashboard_unavailable'")
  expect(route).toContain('{ error: { code, message, retryable, request_id: requestId } }')
})
