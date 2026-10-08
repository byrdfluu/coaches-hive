import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('all customer auth and invite fallbacks lead to the mobile handoff', () => {
  for (const path of [
    'src/app/auth/mobile-invite/page.tsx',
    'src/app/auth/invite/page.tsx',
    'src/app/auth/confirm/page.tsx',
  ]) {
    const page = source(path)
    expect(page).toContain("redirect('/open-app?reason=")
    expect(page).not.toContain('/login')
  }

  const inviteFallback = source('src/app/invite/accept/page.tsx')
  expect(inviteFallback).toContain("reason: 'invitation'")
  expect(inviteFallback).toContain('encodeURIComponent(normalizedToken)')
  expect(inviteFallback).not.toContain('/login')

  const delivery = source('src/lib/inviteDelivery.ts')
  expect(delivery).toContain('/auth/mobile-invite?role=')
  expect(delivery).toContain('/invite/accept?token=')
  expect(delivery).not.toContain('/signup?invite_token=')
})

test('organization payment intents carry authoritative ledger identifiers', () => {
  const checkout = source('src/app/api/mobile/checkout/route.ts')
  const ledger = source('src/lib/paymentLedger.ts')

  expect(checkout).toContain("org_id: isOrganizationPayment ? workspace.organizationId! : ''")
  expect(checkout).toContain("org_id: item.org_id || ''")
  expect(ledger).toContain(".eq('owner_type', 'org')")
  expect(ledger).toContain('metadata.registration_id')
  expect(ledger).toContain('metadata.installment_id')
  expect(ledger).toContain('metadata.item_id')
  expect(ledger).toContain('metadata.assignment_id')
})

test('storefront exposes session checkout only when recurring billing is configured', () => {
  const storefront = source('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain("checkout_available:billing.billingType==='recurring'&&!activeSubscription")
  expect(storefront).toContain("checkout_type:billing.billingType==='recurring'?'recurring_offering':'session'")
})

test('superadmin operational diagnostics cover payment, webhook, workspace, and handoff failures', () => {
  for (const path of [
    'src/app/api/admin/payment-accounting/route.ts',
    'src/app/api/admin/webhooks/route.ts',
    'src/app/api/admin/workspace-reconciliation/route.ts',
    'src/app/api/admin/mobile-handoffs/route.ts',
    'src/app/api/admin/system-health/route.ts',
  ]) {
    expect(source(path)).toContain('requireSuperadminApi')
  }
})
