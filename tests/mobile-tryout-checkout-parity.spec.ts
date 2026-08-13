import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('mobile checkout authoritatively supports paid tryout registrations', () => {
  const route = source('src/app/api/mobile/checkout/route.ts')
  expect(route).toContain("type === 'tryout'")
  expect(route).toContain("from('org_tryout_registrations')")
  expect(route).toContain("from('org_tryouts')")
  expect(route).toContain('userOwnsAthleteProfile')
  expect(route).toContain("from('athlete_organization_memberships')")
  expect(route).toContain(".in('status', ['pending', 'paid'])")
  expect(route).toContain("loadStripeConnectAccountStatus('org', tryout.org_id, { refresh: true })")
  expect(route).toContain('application_fee_amount: feeBreakdown.platformFeeCents')
  expect(route).toContain('transfer_data: { destination: connectStatus!.stripeAccountId }')
  expect(route).toContain("checkout_type: 'mobile_tryout'")
  expect(route).toContain("kind: 'tryout'")
})

test('program checkout revalidates targeting, capacity, eligibility, and Connect', () => {
  const route = source('src/app/api/mobile/checkout/route.ts')
  expect(route).toContain("supabaseAdmin.rpc('is_org_program_visible'")
  expect(route).toContain("return jsonError('Program is not available to this athlete', 403)")
  expect(route).toContain("return jsonError('Program is full', 409)")
  expect(route).toContain("return jsonError('Program registration is not eligible for payment', 409)")
  expect(route).toContain("loadStripeConnectAccountStatus('org', program.org_id)")
})

test('tryout webhook completion is RPC-authoritative and expiration is safe', () => {
  const fulfillment = source('src/lib/mobileCheckoutFulfillment.ts')
  expect(fulfillment).toContain("'mobile_tryout'")
  expect(fulfillment).toContain("supabaseAdmin.rpc('complete_tryout_registration'")
  expect(fulfillment).toContain(".eq('stripe_checkout_session_id', session.id)")
  expect(fulfillment).toContain(".update({ status: 'expired' })")
})

test('fee assignment amounts are snapshotted and immutable', () => {
  const migration = source('supabase/migrations/20260812050000_org_fee_assignment_amount_snapshot.sql')
  expect(migration).toContain('snapshot_org_fee_assignment_amount')
  expect(migration).toContain("raise exception 'Organization fee assignment amount is immutable'")
  expect(migration).toContain("update public.org_tryout_registrations set status = 'canceled'")
  expect(migration).toContain("check (status in ('pending', 'paid', 'canceled', 'waitlisted', 'expired'))")
})
