import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8')

test('creation exposes three models and editing preserves historical prepaid visibility',()=>{
  const create=read('src/app/org/offerings/new/page.tsx'),edit=read('src/app/org/offerings/[id]/page.tsx')
  for(const model of ['free','fixed_enrollment','monthly_session_membership'])for(const source of[create,edit])expect(source).toContain(model)
  expect(create).not.toContain('prepaid_session_pack')
  expect(edit).toContain('Historical prepaid session pack')
  expect(create).not.toContain('price_per_occurrence')
  expect(create).not.toContain('payment_plan_enabled')
  expect(create).toContain('sessions_included')
  expect(create).toContain('credit_expiration_days')
})

test('server accepts legacy inputs but makes attendance model canonical',()=>{
  const route=read('src/app/api/org/offerings/route.ts')
  expect(route).toContain('legacyAttendance')
  expect(route).toContain("Object.assign(body,legacyAttendance(body))")
  expect(route).toContain('body.offering=legacyAttendance')
  expect(route).toContain('payment_plan_enabled:false')
  expect(route).toContain('price_per_occurrence:null')
})

test('mobile preparation applies free fixed monthly and prepaid checkout routing',()=>{
  const prepare=read('src/app/api/mobile/family/offerings/prepare/route.ts')
  expect(prepare).toContain("attendanceModel === 'free' ? 0 : unitPriceCents")
  expect(prepare).toContain("attendanceModel==='monthly_session_membership'")
  expect(prepare).toContain("attendanceModel==='prepaid_session_pack'")
  expect(prepare).toContain('const amountCents = attendanceModel')
  expect(prepare).toContain('idempotencyKeyFor(request, body)')
  expect(prepare).toContain('hasSameValidHold')
})

test('storefront uses the canonical entitlement RPC and returns session wording fields',()=>{
  const storefront=read('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain("rpc('family_offering_entitlement_summary'")
  for(const field of['attendance_model','sessions_included','sessions_remaining','current_period_end','cancellation_cutoff_hours'])expect(storefront).toContain(field)
  expect(storefront).toContain('Authorization:`Bearer ${bearer}`')
})

test('fixed enrollment remains one payment and selected dates remain attendance selections',()=>{
  const checkout=read('src/app/api/mobile/checkout/route.ts'),family=read('src/app/athlete/programs/page.tsx')
  expect(checkout).toContain('const amountCents = Math.round(Number(program.price || 0) * 100)')
  expect(checkout).not.toContain("String(program.fulfillment_mode || 'series') === 'per_occurrence'")
  expect(family).toContain('attendance dates selected')
})

test('prepaid packs activate only during webhook fulfillment and remain replay safe',()=>{
  const fulfillment=read('src/lib/mobileCheckoutFulfillment.ts')
  expect(fulfillment).toContain("rpc('activate_prepaid_offering_pack'")
  expect(fulfillment).toContain('p_checkout_session_id:session.id')
  expect(fulfillment).toContain('prepaid-pack-activated:${membership.id}:${session.id}')
  expect(fulfillment).not.toContain("rpc('activate_one_time_org_offering_credit_pack'")
})

test('monthly renewals grant sessions only for applied paid webhook state',()=>{
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain('membershipState?.applied === true && paymentSucceeded')
  expect(webhook).toContain("rpc('activate_org_offering_credit_cycle'")
  expect(webhook).toContain('offering-renewal-grant:${membershipId}:${invoice.id}')
  expect(webhook).toContain('offering-payment-failed:${membershipId}:${event.id}')
  expect(webhook).toContain('p_event_created: event.created')
})

test('cancellation and rescheduling remain atomic canonical RPC operations',()=>{
  const route=read('src/app/api/athlete/offering-occurrences/route.ts')
  expect(route).toContain("rpc('cancel_family_offering_occurrence'")
  expect(route).toContain("rpc('reschedule_family_offering_occurrence'")
  expect(route).toContain('p_new_occurrence_id')
})

test('multi-athlete checkout keeps one idempotent preparation per athlete',()=>{
  const component=read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(component).toContain("'/api/mobile/family/offerings/prepare'")
  expect(component).toContain('athlete_profile_id')
  expect(component).toContain('Idempotency-Key')
  expect(component).toContain('`Continue to ${nextPending.athleteName}`')
})
