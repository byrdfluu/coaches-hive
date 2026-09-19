import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const required = {
  baseUrl: process.env.PAYMENT_E2E_BASE_URL || 'https://app.coacheshive.com',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  email: process.env.PAYMENT_E2E_PAYER_EMAIL,
  password: process.env.PAYMENT_E2E_PAYER_PASSWORD,
  offerId: process.env.PAYMENT_E2E_RECURRING_OFFER_ID,
  athleteId: process.env.PAYMENT_E2E_ATHLETE_ID,
}

test('live recurring checkout returns a status-compatible fee id and reuses it', async ({ request }) => {
  test.skip(Object.values(required).some((value) => !value), 'Dedicated recurring-payment E2E fixture is not configured')
  const supabase = createClient(required.supabaseUrl!, required.anonKey!, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email: required.email!, password: required.password! })
  expect(error).toBeNull()
  const token = data.session?.access_token
  expect(token).toBeTruthy()
  const idempotencyKey = `recurring-e2e-${crypto.randomUUID()}`
  const headers = { Authorization: `Bearer ${token}` }
  const payload = { fee_offer_id: required.offerId, athlete_id: required.athleteId, idempotency_key: idempotencyKey }

  const first = await request.post(`${required.baseUrl}/api/mobile/recurring-fees/start`, { headers, data: payload })
  expect(first.status()).toBe(200)
  const firstBody = await first.json()
  expect(firstBody.fee_id).toMatch(/^[0-9a-f-]{36}$/i)
  expect(firstBody.checkout_url).toMatch(/^https:\/\/checkout\.stripe\.com\//)

  const status = await request.get(`${required.baseUrl}/api/mobile/recurring-fees/status?fee_id=${encodeURIComponent(firstBody.fee_id)}`, { headers })
  expect(status.status()).toBe(200)
  const statusBody = await status.json()
  expect(statusBody.fee.id).toBe(firstBody.fee_id)
  expect(statusBody.fee.athlete_id).toBe(required.athleteId)

  const repeated = await request.post(`${required.baseUrl}/api/mobile/recurring-fees/start`, { headers, data: payload })
  expect(repeated.status()).toBe(200)
  const repeatedBody = await repeated.json()
  expect(repeatedBody.fee_id).toBe(firstBody.fee_id)
  expect(repeatedBody.checkout_url).toBe(firstBody.checkout_url)
  expect(repeatedBody.reused).toBe(true)
})
