import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('web offering registration uses one canonical prepare request per athlete', () => {
  const component = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(component).toContain("fetch('/api/mobile/family/offerings/prepare'")
  expect(component).toContain('athlete_profile_id: athleteId')
  expect(component).toContain('occurrence_ids: workflow.occurrenceIds')
  expect(component).toContain('Each athlete will have a separate checkout.')
  expect(component).not.toContain('athlete_profile_ids')
})

test('idempotency is stable for parent athlete offering and sorted occurrences', () => {
  const contract = read('src/lib/multiAthleteCheckout.ts')
  expect(contract).toContain('input.parentId, input.athleteId, input.offeringId')
  expect(contract).toContain('canonicalOccurrenceIds(input.occurrenceIds)')
  expect(contract).toContain("return `family-offering:${digest}`")
  const component = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(component).toContain("'Idempotency-Key': row.idempotencyKey")
  expect(component).toContain('idempotency_key: row.idempotencyKey')
})

test('athletes advance independently and only one Stripe checkout opens', () => {
  const component = read('src/components/MultiAthleteOfferingCheckout.tsx')
  for (const state of ['pending', 'checkout_ready', 'payment_processing', 'enrolled', 'failed', 'cancelled']) {
    expect(component).toContain(state)
  }
  expect(component).toContain('window.location.assign(row.checkoutUrl)')
  expect(component).toContain('Continue to ${nextPending.athleteName}')
  expect(component).toContain("['failed', 'cancelled'].includes(row.status)")
  expect(component).toContain('summary.enrolled === workflow.rows.length')
})

test('successful rows survive failures cancellations retries and mixed free or paid results', () => {
  const component = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(component).toContain("status: 'failed'")
  expect(component).toContain("status: 'enrolled'")
  expect(component).toContain("if (!payload.checkout_required)")
  expect(component).toContain("status: 'checkout_ready'")
  expect(component).toContain('updateCheckoutRow(workflow, athleteId')
  const contract = read('src/lib/multiAthleteCheckout.ts')
  expect(contract).toContain("status: cancelled ? 'cancelled' as const : 'payment_processing' as const")
})

test('Stripe returns resume the web progress screen while webhook completion remains authoritative', () => {
  const completion = read('src/components/MobilePaymentCompletion.tsx')
  const recurringReturn = read('src/app/mobile/payment-return/MobilePaymentReturn.tsx')
  expect(completion).toContain('markReturnedCheckout')
  expect(recurringReturn).toContain('markReturnedCheckout')
  expect(completion).toContain('/athlete/programs?multi_checkout=')
  expect(recurringReturn).toContain('/athlete/programs?multi_checkout=')
  const component = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(component).toContain("row.status === 'payment_processing'")
  expect(component).toContain("['paid', 'active'].includes")
  expect(component).toContain('/api/athlete/org-programs?athlete_profile_id=')
})

test('canonical backend retains per-athlete capacity eligibility receipts calendars and Connect checkout', () => {
  const prepare = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  const checkout = read('src/app/api/mobile/checkout/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  const calendar = read('src/app/api/athlete/offering-schedule/route.ts')
  expect(prepare).toContain('resolveAuthorizedAthleteContext(user.id, athleteId)')
  expect(prepare).toContain("rpc('select_family_offering_occurrences'")
  expect(prepare).toContain("fail('OFFERING_FULL'")
  expect(checkout).toContain("application_fee_amount: paymentContract.application_fee_cents")
  expect(checkout).toContain('transfer_data: { destination: connectStatus!.stripeAccountId }')
  expect(webhook).toContain('payment_receipts')
  expect(calendar).toContain("rpc('family_offering_calendar'")
})

test('canonical tryouts use the same separate family checkout instead of the legacy payment form', () => {
  const page = read('src/app/tryouts/[id]/page.tsx')
  const route = read('src/app/api/tryouts/[id]/route.ts')
  expect(page).toContain("type: 'tryout'")
  expect(page).toContain('<MultiAthleteOfferingCheckout')
  expect(page).toContain('selectedOccurrences')
  expect(route).toContain("from('org_tryouts')")
  expect(route).toContain("from('org_offering_occurrences')")
  expect(route).toContain('offeringCapacitySnapshot')
})
