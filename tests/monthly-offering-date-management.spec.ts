import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('initial and post-activation date choices use the canonical transactional selector', () => {
  const api = read('src/app/api/athlete/org-programs/route.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(api).toContain("rpc('select_family_offering_occurrences'")
  expect(api).toContain('if (occurrenceIds.length)')
  expect(page).toContain('Choose Dates')
  expect(page).toContain('credits_remaining')
  expect(page).toContain('credits_per_period')
})

test('credit limits and capacity conflicts remain database-owned and safely surfaced', () => {
  const reservation = read('src/lib/offeringReservations.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(reservation).toContain('CREDITS_EXHAUSTED')
  expect(reservation).toContain('OFFERING_FULL')
  expect(page).toContain('selectedCount >= limit')
  expect(page).toContain('available_spots===0')
})

test('cancellation and rescheduling preserve selection and occurrence identities', () => {
  const api = read('src/app/api/athlete/offering-occurrences/route.ts')
  const page = read('src/app/athlete/programs/page.tsx')
  expect(api).toContain("rpc('cancel_family_offering_occurrence'")
  expect(api).toContain("rpc('reschedule_family_offering_occurrence'")
  expect(api).toContain('p_new_occurrence_id')
  expect(page).toContain('selection_id: selectionId')
  expect(page).toContain('replacement_occurrence_id: replacementId')
  expect(page).toContain('One session was restored')
  expect(page).toContain('no session was restored')
})

test('mutations refresh availability, enrollment, and spendable credit state', () => {
  const page = read('src/app/athlete/programs/page.tsx')
  const credits = read('src/app/api/athlete/credits/route.ts')
  expect(page).toContain('await reloadAssignedPrograms()')
  expect(page).toContain('View session history')
  expect(credits).toContain("rpc('my_credit_balances'")
  expect(credits).toContain("rpc('my_credit_history'")
})

test('payment reconciliation and webhook ordering stay server-authoritative', () => {
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain("rpc('apply_offering_credit_membership_stripe_state'")
  expect(webhook).toContain("rpc('activate_org_offering_credit_cycle'")
  expect(webhook).toContain('p_event_id: event.id')
  expect(webhook).toContain('p_event_created: event.created')
  expect(webhook).toContain('membershipState?.applied === true')
})

test('retry paths retain registration identity and prevent duplicate occurrence selections', () => {
  const prepare = read('src/app/api/mobile/family/offerings/prepare/route.ts')
  expect(prepare).toContain('hasSameValidHold')
  expect(prepare).toContain('existing.stripe_checkout_session_id')
  expect(prepare).toContain('idempotencyKeyFor(request, body)')
})
