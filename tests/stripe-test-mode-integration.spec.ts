import { expect, test, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { randomUUID } from 'node:crypto'

type PaymentFixture = {
  category: string
  endpoint: string
  body: Record<string, unknown>
  expected_transaction_type: string
  expected_status?: number
  fulfillment?: { table: string; id: string; status_column: string; status_value: string }
}
type Fixtures = {
  successful_payments: PaymentFixture[]
  declined_payment?: PaymentFixture
  duplicate_checkout?: PaymentFixture
  canceled_checkout?: PaymentFixture
  incorrect_workspace_recipient?: PaymentFixture
  connect_not_ready?: PaymentFixture
  partial_refund_request_id?: string
  full_refund_request_id?: string
  failed_refund_request_id?: string
}

const requiredCategories = [
  'organization_fee', 'coach_fee', 'coach_booking', 'marketplace_item', 'marketplace_cart',
  'program', 'tryout', 'membership', 'installment', 'registration', 'dues', 'event',
  'fundraising', 'facility', 'equipment', 'travel',
]
const secretKey = process.env.E2E_STRIPE_TEST_SECRET_KEY || ''
const webhookSecret = process.env.E2E_STRIPE_TEST_WEBHOOK_SECRET || ''
const bearerToken = process.env.E2E_PAYMENT_BEARER_TOKEN || ''
const adminToken = process.env.E2E_SUPERADMIN_BEARER_TOKEN || ''
const supabaseUrl = process.env.E2E_SUPABASE_URL || ''
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || ''
const baseUrl = (process.env.E2E_PAYMENT_BASE_URL || '').replace(/\/$/, '')
let fixtures: Fixtures | null = null
try { fixtures = JSON.parse(process.env.E2E_STRIPE_PAYMENT_FIXTURES_JSON || 'null') } catch { fixtures = null }
const configured = Boolean(secretKey.startsWith('sk_test_') && webhookSecret.startsWith('whsec_')
  && bearerToken && adminToken && supabaseUrl && serviceKey && baseUrl && fixtures)

test.describe('real Stripe test-mode payment lifecycle', () => {
  test.skip(!configured, 'Requires isolated Stripe test-mode, Supabase test-project, bearer tokens, and seeded fixture IDs')
  const stripe = configured ? new Stripe(secretKey, { apiVersion: '2025-12-15.clover' }) : null
  const database = configured ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null

  const apiPost = (request: APIRequestContext, fixture: PaymentFixture) => request.post(`${baseUrl}${fixture.endpoint}`, {
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    data: fixture.body,
  })

  const deliver = async (request: APIRequestContext, type: string, object: object, eventId = `evt_ch_${randomUUID().replaceAll('-', '')}`) => {
    const payload = JSON.stringify({ id: eventId, object: 'event', api_version: '2025-12-15.clover', created: Math.floor(Date.now() / 1000), livemode: false, type, data: { object } })
    const signature = stripe!.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
    const response = await request.post(`${baseUrl}/api/stripe/webhook`, {
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      data: payload,
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    return eventId
  }

  const waitForRow = async (table: string, column: string, value: string, statusColumn?: string, statusValue?: string) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let query = database!.from(table).select('*').eq(column, value)
      if (statusColumn && statusValue) query = query.eq(statusColumn, statusValue)
      const { data } = await query.maybeSingle()
      if (data) return data
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`Timed out waiting for ${table}.${column}=${value}`)
  }

  const createIntent = async (request: APIRequestContext, fixture: PaymentFixture) => {
    const response = await apiPost(request, fixture)
    expect(response.status(), await response.text()).toBe(fixture.expected_status || 200)
    const payload = await response.json()
    expect(payload.amount_cents).toEqual(expect.any(Number))
    expect(Number.isInteger(payload.amount_cents)).toBeTruthy()
    expect(payload.client_secret).toEqual(expect.any(String))
    return { payload, intentId: String(payload.client_secret).split('_secret_')[0] }
  }

  test('all payment categories complete checkout, signed webhook, ledger, receipt, and fulfillment', async ({ request }) => {
    const byCategory = new Map(fixtures!.successful_payments.map((fixture) => [fixture.category, fixture]))
    expect(Array.from(byCategory.keys()).sort()).toEqual([...requiredCategories].sort())
    for (const category of requiredCategories) {
      const fixture = byCategory.get(category)!
      const { intentId } = await createIntent(request, fixture)
      await stripe!.paymentIntents.confirm(intentId, { payment_method: 'pm_card_visa' })
      const intent = await stripe!.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] })
      expect(intent.status, category).toBe('succeeded')
      await deliver(request, 'payment_intent.succeeded', intent)
      const transaction = await waitForRow('payment_transactions', 'stripe_payment_intent_id', intent.id, 'status', 'succeeded')
      expect(transaction.transaction_type).toBe(fixture.expected_transaction_type)
      for (const field of ['amount_cents', 'platform_fee_cents', 'stripe_processing_fee_cents', 'net_cents']) {
        expect(Number.isInteger(Number(transaction[field])), `${category}.${field}`).toBeTruthy()
      }
      await waitForRow('payment_receipts', 'stripe_payment_intent_id', intent.id, 'status', 'paid')
      if (fixture.fulfillment) {
        await waitForRow(fixture.fulfillment.table, 'id', fixture.fulfillment.id, fixture.fulfillment.status_column, fixture.fulfillment.status_value)
      }
    }
  })

  test('declines are authoritative and never create paid receipts', async ({ request }) => {
    const fixture = fixtures!.declined_payment!
    const { intentId } = await createIntent(request, fixture)
    await expect(stripe!.paymentIntents.confirm(intentId, { payment_method: 'pm_card_chargeDeclined' })).rejects.toBeTruthy()
    const intent = await stripe!.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] })
    await deliver(request, 'payment_intent.payment_failed', intent)
    await waitForRow('payment_transactions', 'stripe_payment_intent_id', intent.id, 'status', 'failed')
    const { data: receipt } = await database!.from('payment_receipts').select('id').eq('stripe_payment_intent_id', intent.id).maybeSingle()
    expect(receipt).toBeNull()
  })

  test('duplicate checkout and webhook deliveries remain idempotent', async ({ request }) => {
    const fixture = fixtures!.duplicate_checkout!
    const first = await createIntent(request, fixture)
    const second = await createIntent(request, fixture)
    expect(second.intentId).toBe(first.intentId)
    await stripe!.paymentIntents.confirm(first.intentId, { payment_method: 'pm_card_visa' })
    const intent = await stripe!.paymentIntents.retrieve(first.intentId, { expand: ['latest_charge.balance_transaction'] })
    const eventId = `evt_ch_duplicate_${randomUUID().replaceAll('-', '')}`
    await deliver(request, 'payment_intent.succeeded', intent, eventId)
    await deliver(request, 'payment_intent.succeeded', intent, eventId)
    const { count: ledgerCount } = await database!.from('payment_transactions').select('id', { count: 'exact', head: true }).eq('stripe_payment_intent_id', intent.id)
    const { count: receiptCount } = await database!.from('payment_receipts').select('id', { count: 'exact', head: true }).eq('stripe_payment_intent_id', intent.id)
    expect(ledgerCount).toBe(1)
    expect(receiptCount).toBe(1)
  })

  test('delayed out-of-order failures cannot regress a succeeded payment', async ({ request }) => {
    const fixture = fixtures!.duplicate_checkout!
    const { intentId } = await createIntent(request, { ...fixture, body: { ...fixture.body, idempotency_key: randomUUID() } })
    await stripe!.paymentIntents.confirm(intentId, { payment_method: 'pm_card_visa' })
    const intent = await stripe!.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] })
    await deliver(request, 'payment_intent.succeeded', intent)
    await deliver(request, 'payment_intent.payment_failed', intent)
    await waitForRow('payment_transactions', 'stripe_payment_intent_id', intent.id, 'status', 'succeeded')
  })

  test('canceled Checkout Sessions do not create successful ledger or receipts', async ({ request }) => {
    const fixture = fixtures!.canceled_checkout!
    const response = await apiPost(request, fixture)
    expect(response.ok(), await response.text()).toBeTruthy()
    const payload = await response.json()
    const sessionId = payload.checkout_session_id || String(payload.checkout_url || '').match(/(cs_test_[^/?#]+)/)?.[1]
    expect(sessionId).toBeTruthy()
    const session = await stripe!.checkout.sessions.expire(sessionId)
    await deliver(request, 'checkout.session.expired', session)
    if (session.payment_intent) {
      const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id
      const { data } = await database!.from('payment_transactions').select('status').eq('stripe_payment_intent_id', intentId).maybeSingle()
      expect(data?.status).not.toBe('succeeded')
    }
  })

  test('incorrect workspace recipients and incomplete Connect accounts are rejected', async ({ request }) => {
    for (const fixture of [fixtures!.incorrect_workspace_recipient!, fixtures!.connect_not_ready!]) {
      const response = await apiPost(request, fixture)
      expect(response.status()).toBe(fixture.expected_status || 409)
      expect(await response.json()).toHaveProperty('error')
    }
  })

  test('partial, full, and failed refunds persist only Stripe-confirmed outcomes', async ({ request }) => {
    for (const [kind, requestId] of [
      ['partial', fixtures!.partial_refund_request_id],
      ['full', fixtures!.full_refund_request_id],
      ['failed', fixtures!.failed_refund_request_id],
    ] as const) {
      expect(requestId, `${kind} refund fixture`).toBeTruthy()
      const response = await request.post(`${baseUrl}/api/admin/refunds`, {
        headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
        data: { request_id: requestId, action: 'approve_and_refund', resolution_note: `Automated ${kind} refund test` },
      })
      if (kind === 'failed') {
        expect(response.ok()).toBeFalsy()
        await waitForRow('payment_refund_requests', 'id', requestId!, 'status', 'failed')
        continue
      }
      expect(response.ok(), await response.text()).toBeTruthy()
      const payload = await response.json()
      expect(payload.status).toBe('processing')
      const refund = await stripe!.refunds.retrieve(payload.stripe_refund_id)
      await deliver(request, refund.status === 'failed' ? 'refund.failed' : 'refund.updated', refund)
      await waitForRow('payment_refund_requests', 'id', requestId!, 'status', refund.status === 'succeeded' ? 'refunded' : 'processing')
    }
  })
})
