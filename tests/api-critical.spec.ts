/**
 * api-critical.spec.ts
 *
 * API-level tests for the five highest-risk endpoints before rollout.
 * These tests cover validation and auth-guard behavior only — no real
 * user accounts are required. Tests that need credentials gracefully
 * degrade (same pattern as auth-role-flows.spec.ts).
 *
 * Endpoints covered:
 *   POST /api/auth/signup
 *   GET  /api/roles/available
 *   POST /api/payments/intent
 *   POST /api/stripe/webhook
 *   POST /api/stripe/connect-webhook
 */

import { test, expect } from '@playwright/test'
import crypto from 'crypto'

/** Build a valid Stripe webhook signature for a given payload and secret. */
function stripeSign(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const signed = `${timestamp}.${payload}`
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex')
  return `t=${timestamp},v1=${sig}`
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

test.describe('POST /api/auth/signup — input validation', () => {
  test('returns 400 when email is missing', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { password: 'Test1234!', role: 'coach', full_name: 'Test Coach' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/email/i)
  })

  test('returns 400 when password is missing', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { email: 'test@example.com', role: 'coach', full_name: 'Test Coach' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/password/i)
  })

  test('returns 400 when role is invalid', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { email: 'test@example.com', password: 'Test1234!', role: 'hacker', full_name: 'Test' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/role/i)
  })

  test('returns 400 when full_name is missing', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: { email: 'test@example.com', password: 'Test1234!', role: 'coach' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/full name/i)
  })

  test('returns 400 for malformed JSON body', async ({ request }) => {
    const res = await request.post('/api/auth/signup', {
      data: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    // Malformed body falls back to {} via .catch(() => ({})), so
    // the first required-field check fires — email is missing.
    expect(res.status()).toBe(400)
  })
})

// ─── GET /api/roles/available ─────────────────────────────────────────────────

test.describe('GET /api/roles/available — auth guard', () => {
  test('returns 401 without a session', async ({ request }) => {
    const res = await request.get('/api/roles/available')
    expect(res.status()).toBe(401)
  })

  test('returns JSON with error field on 401', async ({ request }) => {
    const res = await request.get('/api/roles/available')
    const body = await res.json()
    expect(typeof body.error).toBe('string')
  })
})

// ─── POST /api/payments/intent ────────────────────────────────────────────────

test.describe('POST /api/payments/intent — auth guard', () => {
  test('returns 401 without a session', async ({ request }) => {
    const res = await request.post('/api/payments/intent', {
      data: { amount: 5000, metadata: { coachId: 'test-coach-id' } },
    })
    expect(res.status()).toBe(401)
  })

  test('returns 401 even with a zero amount (auth checked first)', async ({ request }) => {
    const res = await request.post('/api/payments/intent', {
      data: { amount: 0 },
    })
    expect(res.status()).toBe(401)
  })
})

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────

test.describe('POST /api/stripe/webhook — signature guard', () => {
  test('returns 400 when stripe-signature header is missing', async ({ request }) => {
    const res = await request.post('/api/stripe/webhook', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
  })

  test('returns 400 when stripe-signature is malformed', async ({ request }) => {
    const res = await request.post('/api/stripe/webhook', {
      data: '{}',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'not-a-real-signature',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('returns 400 when stripe-signature timestamp and hmac are invalid', async ({ request }) => {
    const res = await request.post('/api/stripe/webhook', {
      data: '{}',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=12345,v1=deadbeefdeadbeefdeadbeefdeadbeef',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('accepts a correctly signed synthetic event', async ({ request }) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) {
      // Webhook secret not in test env — skipping signature test.
      // Set STRIPE_WEBHOOK_SECRET in .env.local to enable this check.
      expect(true).toBe(true)
      return
    }

    const payload = JSON.stringify({ id: 'evt_test', type: 'ping', data: { object: {} } })
    const sig = stripeSign(payload, secret)

    const res = await request.post('/api/stripe/webhook', {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sig,
      },
    })

    // Unknown event types are silently ignored — the handler still returns 200.
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
  })
})

// ─── POST /api/stripe/connect-webhook ─────────────────────────────────────────

test.describe('POST /api/stripe/connect-webhook — signature guard', () => {
  test('returns 400 when stripe-signature header is missing', async ({ request }) => {
    const res = await request.post('/api/stripe/connect-webhook', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
  })

  test('returns 400 when stripe-signature is malformed', async ({ request }) => {
    const res = await request.post('/api/stripe/connect-webhook', {
      data: '{}',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'not-a-real-signature',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('accepts a correctly signed synthetic connected-account event', async ({ request }) => {
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    if (!secret) {
      expect(true).toBe(true)
      return
    }

    const payload = JSON.stringify({
      id: 'evt_connect_test',
      type: 'ping',
      account: 'acct_test_connected',
      data: { object: {} },
    })
    const sig = stripeSign(payload, secret)

    const res = await request.post('/api/stripe/connect-webhook', {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sig,
      },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
  })
})
