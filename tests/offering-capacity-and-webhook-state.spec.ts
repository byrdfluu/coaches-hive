import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { calculateOrganizationPayment } from '../src/lib/organizationPaymentPolicy'
import { safeOfferingReservationError } from '../src/lib/offeringReservations'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('concurrent final-seat attempts use the transactional selection RPC and canonical capacity snapshot', () => {
  const prepare=read('src/app/api/mobile/family/offerings/prepare/route.ts')
  const reservations=read('src/lib/offeringReservations.ts')
  expect(prepare).toContain("rpc('select_family_offering_occurrences'")
  expect(reservations).toContain("rpc('offering_occurrence_capacity_snapshot'")
})

test('abandoned and expired Checkout sessions release program and tryout capacity', () => {
  const checkout=read('src/app/api/mobile/checkout/route.ts')
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  expect(checkout).toContain("releaseOfferingCheckoutReservation('program'")
  expect(checkout).toContain("releaseOfferingCheckoutReservation('tryout'")
  expect(webhook).toContain('releaseOfferingCheckoutReservation')
  expect(webhook).toContain("checkoutType === 'mobile_program'")
  expect(webhook).toContain("checkoutType === 'mobile_tryout'")
})

test('Checkout binding uses the actual Stripe expiration for both registration types', () => {
  const checkout=read('src/app/api/mobile/checkout/route.ts')
  expect(checkout.match(/bindOfferingCheckoutReservation/g)?.length).toBeGreaterThanOrEqual(3)
  expect(checkout.match(/expiresAt: session\.expires_at/g)?.length).toBe(2)
  expect(read('src/lib/offeringReservations.ts')).toContain("rpc('bind_offering_checkout_reservation'")
})

test('paid fulfillment converts registration holds through canonical registration status transitions', () => {
  const fulfillment=read('src/lib/mobileCheckoutFulfillment.ts')
  expect(fulfillment).toContain("status: 'paid'")
  expect(fulfillment).toContain("rpc('complete_tryout_registration'")
})

test('retry reuses an open session and matching valid hold without selecting duplicates', () => {
  const checkout=read('src/app/api/mobile/checkout/route.ts')
  const prepare=read('src/app/api/mobile/family/offerings/prepare/route.ts')
  expect(checkout).toContain('reusableCheckout(registration.stripe_checkout_session_id)')
  expect(prepare).toContain('hasSameValidHold')
  expect(prepare).toContain('existing.stripe_checkout_session_id')
})

test('storefront and web portals expose per-occurrence snapshot availability', () => {
  for (const file of ['src/app/api/mobile/family/storefront/route.ts','src/app/api/athlete/org-programs/route.ts',
    'src/app/api/org/offerings/route.ts','src/app/api/org/offering-calendar/route.ts','src/app/api/org/reports/export/route.ts']) {
    expect(read(file)).toContain('offeringCapacitySnapshot')
  }
})

test('reservation failures are structured and never expose database text', () => {
  expect(safeOfferingReservationError({message:'OFFERING_FULL internal detail'})).toEqual({
    code:'OFFERING_FULL',message:'This date and time is full.',status:409,
  })
  expect(safeOfferingReservationError({message:'REGISTRATION_FORBIDDEN secret'}).status).toBe(403)
  expect(safeOfferingReservationError({message:'arbitrary database failure'}).message).toBe('A selected date and time is unavailable.')
})

test('webhook state is monotonic and downstream work is gated on applied true', () => {
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  for (const rpc of ['apply_offering_recurring_stripe_state','apply_offering_credit_membership_stripe_state',
    'apply_org_training_purchase_stripe_state','expire_offering_checkout']) expect(webhook).toContain(`rpc('${rpc}'`)
  expect(webhook).toContain("return 'noop' as const")
  expect(webhook).toContain("return 'applied' as const")
  expect(webhook).toContain("=== 'applied'")
})

test('one-time packs and monthly renewals use training state RPC before credit activation', () => {
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  const stateCall=webhook.indexOf("rpc('apply_org_training_purchase_stripe_state'")
  const activation=webhook.indexOf("rpc('activate_org_training_purchase'",stateCall)
  expect(stateCall).toBeGreaterThan(-1)
  expect(activation).toBeGreaterThan(stateCall)
  expect(webhook).toContain("p_status: 'active'")
  expect(webhook).toContain("paymentSucceeded ? 'active' : 'past_due'")
})

test('duplicate and out-of-order events are successful no-ops and Checkout expiration is RPC-owned', () => {
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain("state?.applied !== true")
  expect(webhook).toContain("return 'noop' as const")
  expect(webhook).toContain("rpc('expire_offering_checkout'")
  expect(webhook).not.toMatch(/from\('offering_recurring_subscriptions'\)\.update\(\{\s*status:/)
})

test('payment failures and refunds persist their Stripe ordering cursor', () => {
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain("syncPaymentIntentToLedger(intent, 'failed', event)")
  expect(webhook.match(/last_stripe_event_created: event\.created/g)?.length).toBeGreaterThanOrEqual(2)
  expect(webhook.match(/last_stripe_event_id: event\.id/g)?.length).toBeGreaterThanOrEqual(2)
})

test('payment ledger persists Stripe event ordering and receipts remain idempotent', () => {
  const ledger=read('src/lib/paymentLedger.ts')
  for (const field of ['last_stripe_event_created','last_stripe_event_id','last_stripe_event_type']) expect(ledger).toContain(field)
  expect(ledger).toContain("eq('stripe_payment_intent_id', intent.id).maybeSingle()")
})

test('full-program and per-occurrence totals preserve fee and payout arithmetic', () => {
  const full=calculateOrganizationPayment(10_000)
  expect(full.platform_fee_cents).toBe(400)
  expect(full.service_fee_cents).toBe(380)
  expect(full.total_cents).toBe(10_380)
  expect(full.organization_net_cents).toBe(9_600)
  const perOccurrence=calculateOrganizationPayment(2_500*3)
  expect(perOccurrence.base_amount_cents).toBe(7_500)
  expect(perOccurrence.platform_fee_cents).toBe(300)
  expect(perOccurrence.total_cents).toBe(7_500+Math.ceil(7_500*0.035)+30)
  const accounting=read('src/lib/mobileCheckoutFulfillment.ts')
  for(const field of ['base_amount_cents','service_fee_cents','total_amount_cents','platform_fee_cents',
    'stripe_processing_fee_cents','organization_net_amount_cents','coaches_hive_net_amount_cents']) expect(accounting).toContain(field)
})
