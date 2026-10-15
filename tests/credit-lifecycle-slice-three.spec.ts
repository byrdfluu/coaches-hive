import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test.describe('Slice 3 credit lifecycle contracts', () => {
  test('displayed balances use canonical eligible-cycle read models and never raw ledger sums', () => {
    const programs = read('src/app/api/athlete/org-programs/route.ts')
    const training = read('src/app/api/athlete/training-packages/route.ts')
    const credits = read('src/app/api/athlete/credits/route.ts')
    for (const source of [programs, training, credits]) expect(source).toContain("rpc('my_credit_balances'")
    expect(programs).not.toContain("from('org_offering_credit_ledger')")
    expect(training).not.toContain("from('org_training_credit_ledger')")
  })

  test('booking and cancellation remain canonical and insufficient balances are safe conflicts', () => {
    const route = read('src/app/api/athlete/training-packages/route.ts')
    const reservations = read('src/lib/offeringReservations.ts')
    expect(route).toContain("rpc('book_org_training_sessions_with_credits'")
    expect(route).toContain("rpc('cancel_org_training_booking'")
    expect(route).not.toMatch(/\.update\([^)]*credit/i)
    expect(reservations).toContain('CREDIT_BALANCE_INSUFFICIENT')
    expect(reservations).toContain('status: 409')
  })

  test('recurring packages activate only from invoice.paid with all six parameters', () => {
    const webhook = read('src/app/api/stripe/webhook/route.ts')
    const fulfillment = read('src/lib/mobileCheckoutFulfillment.ts')
    expect(webhook).toContain("if (event.type === 'invoice.paid')")
    for (const name of ['p_purchase_id', 'p_payment_record_id', 'p_stripe_subscription_id', 'p_current_period_end', 'p_cycle_key', 'p_stripe_invoice_id']) {
      expect(webhook).toContain(name)
    }
    expect(fulfillment).toContain("if (session.mode === 'subscription') return true")
  })

  test('expiration, refund reversal, and audited admin restoration use canonical RPCs', () => {
    const cron = read('src/app/api/cron/credit-expiration/route.ts')
    const refunds = read('src/lib/refundRequests.ts')
    const orgCredits = read('src/app/api/org/credits/route.ts')
    expect(cron).toContain("rpc('expire_org_offering_credits'")
    expect(cron).toContain("rpc('expire_org_training_credits'")
    expect(cron).toContain('CRON_SECRET')
    expect(refunds).toContain("rpc('reverse_org_offering_credit_grant'")
    expect(orgCredits).toContain('canManageProgramOfferings')
    expect(orgCredits).toContain('note.length < 3')
    expect(orgCredits).toContain("rpc('restore_org_offering_credits'")
  })

  test('portal liability, history, expiration and activity stay in parity with spendable balances', () => {
    const athleteApi = read('src/app/api/athlete/credits/route.ts')
    const orgApi = read('src/app/api/org/credits/route.ts')
    const athletePage = read('src/app/athlete/credits/page.tsx')
    const orgPage = read('src/app/org/credits/page.tsx')
    expect(athleteApi).toContain("rpc('my_credit_history'")
    expect(orgApi).toContain("rpc('org_credit_liability'")
    expect(orgApi).toContain("rpc('org_credit_history'")
    expect(athletePage).toContain('Next expiration')
    for (const label of ['Grant', 'Booking', 'Return', 'Expiration', 'Refund reversal', 'Authorized restoration']) {
      expect(athletePage).toContain(label)
    }
    expect(orgPage).toContain('expire within 30 days')
  })

  test('database contract provides locking, idempotent cycles, expiration and negative-balance protection', () => {
    const migrationPath = '/Users/juwan/Desktop/CH App/supabase/migrations/20261014150000_credit_lifecycle_corrections.sql'
    test.skip(!fs.existsSync(migrationPath), 'Authoritative mobile migration is not present in CI checkout')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('order by c.period_end,c.period_start,c.id')
    expect(sql).toContain('for update')
    expect(sql).toContain('CREDIT_BALANCE_INSUFFICIENT')
    expect(sql).toContain('on conflict(purchase_id,cycle_key) do nothing')
    expect(sql).toContain('expire_org_offering_credits')
    expect(sql).toContain('expire_org_training_credits')
    expect(sql).toContain('reverse_org_offering_credit_grant')
  })
})
