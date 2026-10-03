import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8')

test('family refund contract is athlete authorized and transaction backed',()=>{
  const route=read('src/app/api/mobile/refunds/route.ts')
  for(const field of ['payment_type','payment_record_id','transaction_id','athlete_profile_id','organization_id','offering_name','amount_paid_cents','amount_already_refunded_cents','maximum_refundable_amount_cents','currency','payment_date','refund_status','refundable','not_refundable_reason'])expect(route).toContain(field)
  expect(route).toContain('userOwnsAthleteProfile')
  expect(route).toContain("from('payment_transactions')")
  expect(route).toContain('idempotencyKeyFor')
  expect(route).toContain('refundRecordId')
})

test('refund processor supports expanded organization offering types',()=>{
  const service=read('src/lib/refundRequests.ts')
  const migration=read('supabase/migrations/20261002070000_expand_family_refund_contract.sql')
  for(const type of ['program','tryout','training_package','training_session','recurring_renewal']){
    expect(service).toContain(`'${type}'`)
    expect(migration).toContain(`'${type}'`)
  }
  expect(service).toContain("from('payment_transactions')")
  expect(service).toContain('refund webhook updates the transaction')
  expect(migration).toContain('payment_refund_requests_requester_idempotency_uidx')
})

test('recurring training plan portal is owner authorized and Stripe hosted',()=>{
  const route=read('src/app/api/mobile/training-packages/billing-portal/route.ts')
  expect(route).toContain("from('org_training_package_purchases')")
  expect(route).toContain('userOwnsAthleteProfile')
  expect(route).toContain('stripe.billingPortal.sessions.create')
  expect(route).toContain('STRIPE_TRAINING_PACKAGE_PORTAL_CONFIGURATION_ID')
  expect(route).toContain('STRIPE_COACH_MEMBERSHIP_PORTAL_CONFIGURATION_ID')
  expect(route).toContain("return_url: 'coacheshive://billing-updated'")
  expect(route).not.toContain('subscriptions.update')
})
