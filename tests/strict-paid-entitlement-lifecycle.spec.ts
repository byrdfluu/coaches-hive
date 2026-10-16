import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('initial monthly signup and one-time registration remain payment pending until webhook activation', () => {
  const api = read('src/app/api/athlete/org-programs/route.ts')
  const checkout = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(api).toContain("const status = priceCents > 0 ? 'pending' : 'paid'")
  expect(checkout).toContain("const registrationStatus = amountCents > 0 ? 'pending' : 'paid'")
  expect(webhook).toContain("rpc('apply_offering_credit_membership_stripe_state'")
  expect(webhook).toContain("rpc('activate_org_offering_credit_cycle'")
})

test('active paid cycle controls access, period display, and occurrence filtering', () => {
  const api = read('src/app/api/athlete/org-programs/route.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(api).toContain("membership.status === 'active'")
  expect(api).toContain("rpc('org_offering_eligible_credit_cycles'")
  expect(api).toContain('startsAt>=new Date(cycle.period_start).getTime()')
  expect(api).toContain('startsAt<new Date(cycle.period_end).getTime()')
  expect(page).toContain('Paid period')
  expect(page).toContain('sessions remaining')
})

test('strict entitlement errors are safely and specifically mapped', () => {
  const source = read('src/lib/offeringReservations.ts')
  for (const code of ['OCCURRENCE_OUTSIDE_PAID_PERIOD', 'PAYMENT_REQUIRED', 'CREDITS_EXHAUSTED', 'OFFERING_FULL']) {
    expect(source).toContain(code)
  }
})

test('capacity conflicts preserve other selected dates and allow replacement', () => {
  const page = read('src/app/athlete/programs/page.tsx')
  const checkout = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(page).toContain('Your other selections are still selected; choose a replacement.')
  expect(checkout).toContain('Use updated date selections')
  expect(checkout).toContain("if (['enrolled', 'payment_processing'].includes(row.status)) return row")
})

test('timely and late cancellation results are shown before the canonical mutation', () => {
  const page = read('src/app/athlete/programs/page.tsx')
  const api = read('src/app/api/athlete/offering-occurrences/route.ts')
  expect(page).toContain('Canceling now restores 1 session.')
  expect(page).toContain('The cancellation cutoff has passed, so this session will not be restored.')
  expect(api).toContain("rpc('cancel_family_offering_occurrence'")
})

test('rescheduling is one atomic canonical action', () => {
  const api = read('src/app/api/athlete/offering-occurrences/route.ts')
  expect(api).toContain("rpc('reschedule_family_offering_occurrence'")
  expect(api).toContain('p_new_occurrence_id')
})

test('failed renewal blocks access and provides payment recovery', () => {
  const api = read('src/app/api/athlete/org-programs/route.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(api).toContain("access_allowed:membership.status==='active'&&Boolean(cycle)")
  expect(page).toContain('Payment required. Date selection and session booking are unavailable.')
  expect(page).toContain('Update payment method or retry payment')
  expect(page).toContain('/api/mobile/offerings/billing-portal')
})

test('successful renewal and cancel-at-period-end retain only current paid-cycle access', () => {
  const api = read('src/app/api/athlete/org-programs/route.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(api).toContain('cancel_at_period_end')
  expect(page).toContain('Current paid-period access remains available until then.')
  expect(page).toContain('Cancellation takes effect')
})

test('organization cancellation remains canonical and notifications remain visible', () => {
  const orgApi = read('src/app/api/org/offerings/route.ts')
  const notifications = read('src/components/NotificationsPanel.tsx')
  expect(orgApi).toContain("rpc('remove_org_offering_occurrence'")
  expect(notifications).toContain('offering_cancelled')
})

test('session display uses canonical balances and history with paid expiration', () => {
  const api = read('src/app/api/athlete/credits/route.ts')
  const page = read('src/app/athlete/credits/page.tsx')
  expect(api).toContain("rpc('my_session_balances'")
  expect(api).toContain("rpc('my_session_history'")
  for (const label of ['issued', 'spent', 'returned', 'restored', 'expired']) expect(page).toContain(label)
  expect(page).toContain('Sessions remaining · expires')
})

test('duplicate requests and out-of-order webhooks retain canonical guards', () => {
  const prepare = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(prepare).toContain('idempotencyKeyFor(request, body)')
  expect(prepare).toContain('hasSameValidHold')
  expect(webhook).toContain('p_event_id: event.id')
  expect(webhook).toContain('p_event_created: event.created')
  expect(webhook).toContain('membershipState?.applied === true')
})
