import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('organization checkout requires explicit legal and recurring billing consent', () => {
  const page = source('src/app/checkout/page.tsx')
  expect(page).toContain('orgAuthorityAccepted')
  expect(page).toContain('recurringBillingAccepted')
  expect(page).toContain('minorDataAccepted')
  expect(page).toContain('Start subscription —')
  expect(page).toContain('/organization-terms')
  expect(page).toContain('/data-processing-addendum')
  expect(page).toContain('/payment-terms')
})

test('server rejects bypassed consent and stores durable acceptance evidence', () => {
  const route = source('src/app/api/stripe/subscription/checkout/route.ts')
  expect(route).toContain("organizationConsent?.authorityAccepted !== true")
  expect(route).toContain("organizationConsent?.recurringBillingAccepted !== true")
  expect(route).toContain("organizationConsent?.minorDataAccepted !== true")
  expect(route).toContain("from('organization_legal_acceptances').upsert")
  expect(route).toContain('stripe_checkout_session_id: checkoutSession.id')
  expect(route).toContain("request.headers.get('x-forwarded-for')")
  expect(route).toContain("request.headers.get('user-agent')")
})

test('mobile organization subscription paths enforce the same consent contract', () => {
  const direct = source('src/app/api/mobile/subscription/start/route.ts')
  const handoff = source('src/app/api/stripe/mobile-onboarding-checkout/route.ts')
  const component = source('src/components/MobileSubscriptionPlans.tsx')
  for (const code of [direct, handoff]) {
    expect(code).toContain('Organization agreement and recurring billing consent are required')
    expect(code).toContain("from('organization_legal_acceptances').upsert")
  }
  expect(component).toContain('organizationCheckout')
  expect(component).toContain('recurringBillingAccepted')
})

test('legal acceptance schema and public policies are present', () => {
  const migration = source('supabase/migrations/20260922001000_organization_legal_acceptances.sql')
  for (const field of ['agreement_version','agreement_keys','price_cents','confirmation_text','ip_address','user_agent','stripe_checkout_session_id']) expect(migration).toContain(field)
  for (const path of ['src/app/organization-terms/page.tsx','src/app/data-processing-addendum/page.tsx','src/app/payment-terms/page.tsx']) expect(source(path)).toContain('ORGANIZATION_AGREEMENT_VERSION')
})
