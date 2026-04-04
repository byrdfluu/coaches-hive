import { expect, test, type Page } from '@playwright/test'

const athleteEmail = process.env.E2E_ATHLETE_EMAIL || process.env.E2E_AUTH_EMAIL
const athletePassword = process.env.E2E_ATHLETE_PASSWORD || process.env.E2E_AUTH_PASSWORD

const loginAsAthlete = async (page: Page) => {
  await page.goto('/login')
  await page.locator('form input[type="email"]').first().fill(athleteEmail!)
  await page.locator('form input[type="password"]').first().fill(athletePassword!)
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

test.describe('Athlete portal API contracts — auth guards', () => {
  test('POST /api/profile/save returns 401 without a session', async ({ request }) => {
    const res = await request.post('/api/profile/save', {
      data: { guardian_name: 'Parent Name' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/bookings returns 401 without a session', async ({ request }) => {
    const res = await request.post('/api/bookings', {
      data: { coach_id: 'coach-id', start_time: new Date().toISOString() },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/messages/thread returns 401 without a session', async ({ request }) => {
    const res = await request.post('/api/messages/thread', {
      data: { title: 'Coach thread', participant_ids: ['coach-id'], first_message: 'Hello coach' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/messages/send returns 401 without a session', async ({ request }) => {
    const res = await request.post('/api/messages/send', {
      data: { thread_id: 'thread-id', body: 'Hello' },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe('Athlete portal API contracts — validation', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!athleteEmail || !athletePassword, 'Athlete credentials are not configured for validation checks.')
    await loginAsAthlete(page)
  })

  test('POST /api/profile/save rejects empty payloads with no allowed fields', async ({ page }) => {
    const res = await page.request.post('/api/profile/save', { data: {} })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no valid profile fields/i)
  })

  test('POST /api/bookings rejects missing start_time', async ({ page }) => {
    const res = await page.request.post('/api/bookings', {
      data: { coach_id: 'coach-id' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/coach_id and start_time are required/i)
  })

  test('POST /api/messages/thread requires a title', async ({ page }) => {
    const res = await page.request.post('/api/messages/thread', {
      data: { participant_ids: ['coach-id'], first_message: 'Hello coach' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/title is required/i)
  })

  test('POST /api/messages/send requires a thread and body or attachment', async ({ page }) => {
    const res = await page.request.post('/api/messages/send', {
      data: { thread_id: '' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/thread_id and body or attachment are required/i)
  })
})
