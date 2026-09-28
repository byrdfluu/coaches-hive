import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateOrganizationPayment } from '../src/lib/organizationPaymentPolicy'

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')

test('organization and league routes use one shared payment-link service',()=>{
  const org=source('src/app/api/mobile/org/fee-assignments/[assignmentId]/payment-link/route.ts')
  const league=source('src/app/api/mobile/league/fee-assignments/[assignmentId]/payment-link/route.ts')
  for(const route of [org,league]){
    expect(route).toContain("@/lib/staffFeePaymentLinks")
    expect(route).toContain('createStaffPaymentLink')
    expect(route).toContain('revokeStaffPaymentLinks')
  }
})

test('payment links are opaque, hashed, expiring, revocable, and auditable',()=>{
  const service=source('src/lib/staffFeePaymentLinks.ts')
  const migration=source('supabase/migrations/20260927010000_staff_fee_payment_links.sql')
  expect(service).toContain("randomBytes(32).toString('base64url')")
  expect(service).toContain("createHash('sha256')")
  expect(service).toContain('/pay/${publicToken}')
  expect(service).not.toContain('/pay/${assignment')
  for(const field of ['token_hash','expires_at','revoked_at','stripe_checkout_session_id','idempotency_key']) expect(migration).toContain(field)
  expect(migration).toContain('claim_fee_payment_link_checkout')
  expect(migration).toContain('claim_org_fee_assignment_checkout')
  expect(migration).toContain('claim_league_fee_assignment_checkout')
  expect(migration).toContain('for update')
  expect(migration).toContain('fee_payment_link_audit_events')
})

test('in-app and shared-link checkout use the same atomic assignment claims',()=>{
  const mobile=source('src/app/api/mobile/checkout/route.ts')
  expect(mobile).toContain("rpc('claim_org_fee_assignment_checkout'")
  expect(mobile).toContain("rpc('claim_league_fee_assignment_checkout'")
  const fulfillment=source('src/lib/mobileCheckoutFulfillment.ts')
  expect(fulfillment).toContain('metadata.baseAmountCents || session.amount_total')
})

test('shared checkout uses canonical destination-charge policy and no client amount',()=>{
  const service=source('src/lib/staffFeePaymentLinks.ts')
  expect(service).toContain('calculateOrganizationPayment(assignment.amountCents)')
  expect(service).toContain("payment_method_types:['card','us_bank_account']")
  expect(service).toContain('application_fee_amount:view.contract.application_fee_cents')
  expect(service).toContain('transfer_data:{destination:connect!.stripeAccountId}')
  expect(service).toContain('on_behalf_of:connect!.stripeAccountId')
  expect(service).not.toMatch(/body\.(amount|fee|stripe_customer|destination|application_fee)/)
})

test('final fee schedule is exact at required amounts',()=>{
  for(const base of [100,1_000,2_500,10_000,25_000,100_000]){
    const value=calculateOrganizationPayment(base)
    expect(value.service_fee_cents).toBe(Math.ceil((base*35)/1_000)+30)
    expect(value.platform_fee_cents).toBe(Math.ceil((base*4)/100))
    expect(value.total_cents).toBe(base+value.service_fee_cents)
    expect(value.application_fee_cents).toBe(value.platform_fee_cents+value.service_fee_cents)
    expect(value.organization_net_cents).toBe(base-value.platform_fee_cents)
  }
})

test('public payer page does not disclose athlete identity before verification',()=>{
  const api=source('src/app/api/pay/[token]/route.ts')
  const service=source('src/lib/staffFeePaymentLinks.ts')
  expect(api).toContain('athlete:view.verified?view.athleteName:null')
  expect(service).toContain("invalid_payer_verification")
  expect(api).toContain("service_fee_label:'Service fee (non-refundable)'")
})
