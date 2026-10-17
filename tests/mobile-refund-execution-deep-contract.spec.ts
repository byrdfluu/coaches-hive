import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const route=fs.readFileSync(path.join(process.cwd(),'src/app/api/mobile/refunds/execute/route.ts'),'utf8')

test('bearer authentication and client correlation identity are mandatory',()=>{
  expect(route).toContain("match(/^Bearer\\s+(.+)$/i)")
  expect(route).toContain('requestIdFor(request)')
  expect(route).toContain("'x-request-id':correlationId")
  expect(route).toContain("failure('AUTHENTICATION_REQUIRED'")
})

test('active organization workspace and authoritative roles are verified',()=>{
  expect(route).toContain("eq('workspace_type','organization').eq('status','active')")
  expect(route).toContain("from('workspace_memberships')")
  for(const role of ['owner','org_admin','admin'])expect(route).toContain(`'${role}'`)
  expect(route).toContain("rpc('can_manage_org_refunds'")
  expect(route).toContain('REFUND_EXECUTION_FORBIDDEN')
})

test('execution claims processing before Stripe and reconciles only after Stripe',()=>{
  const claim=route.indexOf("update({status:'refund_processing'")
  const stripe=route.indexOf('stripe.refunds.create')
  const apply=route.indexOf("rpc('apply_offering_refund_result'")
  expect(claim).toBeGreaterThan(0)
  expect(claim).toBeLessThan(stripe)
  expect(stripe).toBeLessThan(apply)
})

test('connected account ownership and direct versus destination charges are supported',()=>{
  expect(route).toContain("from('stripe_connect_payment_accounting')")
  expect(route).toContain('destination!==connect.stripe_account_id')
  expect(route).toContain('{stripeAccount:connect.stripe_account_id}')
  expect(route).toContain('reverse_transfer:true')
  expect(route).toContain('refund_application_fee:true')
})

test('successful and pending Stripe states persist the canonical reconciliation fields',()=>{
  for(const field of ["status:finalStatus","stripe_refund_id:refund.id","refunded_amount_cents:Number(refund.amount)","resolved_at:new Date().toISOString()","updated_at:new Date().toISOString()"])expect(route).toContain(field)
})

test('non-money actions return before any Stripe operation',()=>{
  expect(route.indexOf("if(action!=='money_refund')")).toBeLessThan(route.indexOf('stripe.paymentIntents.retrieve'))
  expect(route).toContain("rpc('resolve_payment_refund_request'")
})

test('safe errors use exactly the correlated nested contract',()=>{
  expect(route).toContain("{error:{code,message:safeMobileMessage(message,status),retryable,request_id:correlationId}}")
  expect(route).toContain('final_http_status:status,error_code:code')
  expect(route).not.toContain('correlation_id:correlationId,error:')
})
