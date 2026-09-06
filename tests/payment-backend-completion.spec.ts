import { expect, test } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isChargeFullyRefunded, refundRequestStatusFromStripe } from '../src/lib/refundRequests'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('every requested mobile payment endpoint exists with the required methods', () => {
  const contracts: Record<string, string[]> = {
    'src/app/api/mobile/checkout/route.ts': ['POST'],
    'src/app/api/stripe/cart-checkout/route.ts': ['POST'],
    'src/app/api/mobile/subscription/start/route.ts': ['POST'],
    'src/app/api/mobile/subscription/apple/activate/route.ts': ['POST'],
    'src/app/api/mobile/billing-portal/route.ts': ['POST'],
    'src/app/api/mobile/registrations/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/org/dues/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/org/payment-events/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/org/fundraising/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/facilities/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/org/equipment/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/org/travel/route.ts': ['GET', 'POST'],
    'src/app/api/mobile/equipment/route.ts': ['GET'],
    'src/app/api/mobile/travel/route.ts': ['GET'],
    'src/app/api/mobile/equipment/[obligationId]/intent/route.ts': ['POST'],
    'src/app/api/mobile/travel/[obligationId]/intent/route.ts': ['POST'],
  }
  for (const [path, methods] of Object.entries(contracts)) {
    expect(existsSync(resolve(process.cwd(), path)), path).toBeTruthy()
    const source = read(path)
    for (const method of methods) expect(source, `${path} ${method}`).toMatch(new RegExp(`(?:function|const) ${method}`))
  }
})

test('mobile cart and admin refunds accept Supabase bearer authentication through middleware', () => {
  const policy = read('src/lib/middlewarePolicy.ts')
  const cart = read('src/app/api/stripe/cart-checkout/route.ts')
  const refunds = read('src/app/api/admin/refunds/route.ts')
  expect(policy).toContain("'/api/stripe/cart-checkout'")
  expect(policy).toContain("'/api/admin/refunds'")
  expect(cart).toContain('getMobileRequestUser(request)')
  expect(refunds).toContain('getMobileRequestUser(request)')
})

test('equipment and travel use canonical cents, server-resolved Connect destination, and webhook fulfillment', () => {
  const collections = read('src/lib/orgPaymentCollections.ts')
  const intent = read('src/lib/canonicalPaymentIntent.ts')
  const ledger = read('src/lib/paymentLedger.ts')
  const migration = read('supabase/migrations/20260905000000_payment_backend_completion.sql')
  for (const type of ['equipment', 'travel']) {
    expect(collections).toContain(`'${type}'`)
    expect(migration).toContain(`'${type}'`)
  }
  for (const field of ['amount_cents', 'platform_fee_cents', 'stripe_processing_fee_cents', 'net_cents']) {
    expect(intent).toContain(field)
  }
  expect(intent).toContain("loadStripeConnectAccountStatus('org', input.orgId)")
  expect(intent).toContain('transfer_data: { destination }')
  expect(collections).not.toMatch(/body\.(platform_fee_cents|stripe_processing_fee_cents|net_cents|destination)/)
  expect(ledger).toContain("rpc('complete_org_payment_collection_obligation'")
  expect(migration).toContain('unique(obligation_id, transaction_id)')
})

test('approve_and_refund is superadmin-only, idempotent, and persists atomic refund audit state', () => {
  const route = read('src/app/api/admin/refunds/route.ts')
  const refunds = read('src/lib/refundRequests.ts')
  const migration = read('supabase/migrations/20260905000000_payment_backend_completion.sql')
  expect(route).toContain("action === 'approve_and_refund'")
  expect(route).toContain("access.teamRole !== 'superadmin'")
  expect(route).toContain("status: 'processing', stripe_refund_id: result.stripe_refund_id")
  expect(refunds).toContain('{ idempotencyKey: `refund-request-${requestId}` }')
  expect(refunds).toContain("rpc('record_refund_request_state'")
  for (const field of ['refunded_amount_cents', 'stripe_refund_status', 'approved_by', 'approved_at', 'audit_metadata']) {
    expect(migration).toContain(field)
  }
})

test('refund state distinguishes pending, failed, partial, and full refunds', () => {
  expect(refundRequestStatusFromStripe('refund.created', 'pending')).toBe('processing')
  expect(refundRequestStatusFromStripe('refund.updated', 'succeeded')).toBe('refunded')
  expect(refundRequestStatusFromStripe('refund.failed', 'failed')).toBe('failed')
  expect(isChargeFullyRefunded(10_000, 2_500)).toBe(false)
  expect(isChargeFullyRefunded(10_000, 10_000)).toBe(true)
})

test('browser completion cannot assert authoritative success for direct checkout redirects', () => {
  const completion = read('src/components/MobilePaymentCompletion.tsx')
  expect(completion).toContain('&status=processing')
  expect(completion).not.toContain("setState('complete')\n      window.location.assign(`coacheshive://payment-complete?type=${encodeURIComponent(type)}&id=${encodeURIComponent(recordId)}`)")
})

test('Apple activation verifies transaction and renewal JWS before granting access', () => {
  const activation = read('src/app/api/mobile/subscription/apple/activate/route.ts')
  const apple = read('src/lib/appleIap.ts')
  for (const token of [
    'signed_transaction',
    'signed_renewal_info',
    'verifyAppleTransaction',
    'verifyAppleRenewalInfo',
    'validateAppleActivation',
    'validateAppleRenewalState',
  ]) expect(activation).toContain(token)
  for (const check of ['bundleId', 'environment', 'expiresDate', 'revocationDate', 'appAccountToken', 'originalTransactionId', 'autoRenewProductId']) {
    expect(apple).toContain(check)
  }
})

test('webhook has signed, retryable idempotency coverage for success, failure, delayed completion, and refunds', () => {
  const webhook = read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain('stripe.webhooks.constructEvent')
  expect(webhook).toContain("logError.code === '23505'")
  expect(webhook).toContain("existingEvent?.status === 'failed'")
  for (const event of [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.expired',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'refund.created',
    'refund.updated',
    'refund.failed',
    'charge.refunded',
  ]) expect(webhook).toContain(event)
  const ledger = read('src/lib/paymentLedger.ts')
  expect(ledger).toContain("['succeeded', 'partially_refunded', 'refunded'].includes(existingStatus)")
  expect(ledger).toContain('recipientEmail && receiptCreated')
})
