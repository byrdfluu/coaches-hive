import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('organization commercial terms are loaded from the database', () => {
  const policy = source('src/lib/orgCommercialTerms.ts')
  const fees = source('src/lib/orgPlatformFees.ts')
  expect(policy).toContain("select('platform_fee_rate,payment_processing_responsibility,complimentary_subscription_until')")
  expect(fees).toContain('loadOrgCommercialTerms(orgId)')
  expect(fees).toContain('terms.platformFeeRate')
  expect(fees).toContain('terms.processingResponsibility')
})

test('$100 Rudy policy charges the parent service fee and pays the Academy $96', () => {
  const policy = source('src/lib/organizationPaymentPolicy.ts')
  expect(policy).toContain('Math.ceil((base * 35) / 1_000) + PARENT_SERVICE_FEE_FIXED_CENTS')
  expect(policy).toContain('Math.ceil((base * 4) / 100)')
  const base = 10_000, platformFee = Math.ceil(base * 4 / 100), serviceFee = Math.ceil(base * 35 / 1_000) + 30
  expect({ parentTotal: base + serviceFee, platformFee, academyNet: base - platformFee, serviceFee })
    .toEqual({ parentTotal: 10_380, platformFee: 400, academyNet: 9_600, serviceFee: 380 })
})

test('canonical destination charges retain the platform and service fees', () => {
  const canonical = source('src/lib/canonicalPaymentIntent.ts')
  expect(canonical).toContain('application_fee_amount: paymentContract.application_fee_cents')
  expect(canonical).toContain("payment_method_types: ['card', 'us_bank_account']")
  expect(canonical).toContain('on_behalf_of: destination')
})

test('complimentary organization access uses the database date on web and mobile checkout', () => {
  for (const path of ['src/app/api/stripe/subscription/checkout/route.ts','src/app/api/mobile/subscription/start/route.ts','src/app/api/stripe/mobile-onboarding-checkout/route.ts']) {
    const route = source(path)
    expect(route).toContain('loadOrgCommercialTerms')
    expect(route).toContain('complimentarySubscriptionUntil')
    expect(route).toContain('trial_end')
  }
  const migration = source('supabase/migrations/20260924020000_rudy_gay_academy_commercial_terms.sql')
  expect(migration).toContain('2027-03-24T00:00:00Z')
  expect(migration).toContain("payment_processing_responsibility = 'org_pays_processing'")
})
