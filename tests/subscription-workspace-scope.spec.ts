import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('organization subscription actions use the selected organization workspace', () => {
  for (const path of [
    'src/app/api/stripe/subscription/checkout/route.ts',
    'src/app/api/stripe/subscription/update/route.ts',
    'src/app/api/stripe/subscription/confirm/route.ts',
  ]) {
    const route = source(path)
    expect(route, path).toContain('resolveActiveOrganizationStaffContext')
    expect(route, path).toContain('active_workspace_id')
    expect(route, path).toContain('current_org_id')
  }
})

test('organization subscription updates match Stripe records by organization id', () => {
  const route = source('src/app/api/stripe/subscription/update/route.ts')
  expect(route).toContain("String(md.org_id || '') === orgId")
  expect(route).toContain("orgId || 'no-org'")
})

test('Stripe webhook synchronization requires durable organization metadata', () => {
  const route = source('src/app/api/stripe/webhook/route.ts')
  expect(route).not.toContain('loadOrgForUser')
  expect(route).toContain('orgId: subscriptionMetadata.org_id || null')
  expect(route).toContain('workspaceId: subscriptionMetadata.workspace_id || null')
})

test('onboarding writes into the selected organization workspace', () => {
  const route = source('src/app/api/onboarding/profile/route.ts')
  expect(route).toContain('resolveActiveOrganizationStaffContext')
  expect(route).toContain('active_workspace_id')
  expect(route).toContain('current_org_id')
})
