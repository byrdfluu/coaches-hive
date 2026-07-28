import { expect, test, type Page } from '@playwright/test'

const loginAndExpectSession = async (page: Page, email: string, password: string) => {
  await page.goto('/login')
  await page.locator('form input[type="email"]').first().fill(email)
  await page.locator('form input[type="password"]').first().fill(password)
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

const logoutAndExpectSignedOut = async (page: Page) => {
  await page.goto('/logout')
  await expect(page).toHaveURL(/\/login$/)
  const sessionCheck = await page.request.get('/api/roles/available')
  expect(sessionCheck.status()).toBe(401)
}

const fallbackEmail =
  process.env.E2E_AUTH_EMAIL
  || process.env.E2E_COACH_EMAIL
  || process.env.E2E_ATHLETE_EMAIL
  || process.env.E2E_ADMIN_EMAIL
  || process.env.E2E_ORG_EMAIL

const fallbackPassword =
  process.env.E2E_AUTH_PASSWORD
  || process.env.E2E_COACH_PASSWORD
  || process.env.E2E_ATHLETE_PASSWORD
  || process.env.E2E_ADMIN_PASSWORD
  || process.env.E2E_ORG_PASSWORD

const expectOpenAppRedirect = async (page: Page, path: string) => {
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(response.headers().location || '').toContain('/open-app')
}

const expectLoginRedirectResponse = async (page: Page, path: string) => {
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(response.headers().location || '').toContain('/login')
}

test.describe('Auth/session flows (credential-free)', () => {
  test('protected API returns 401 when no session exists', async ({ page }) => {
    const response = await page.request.get('/api/roles/available')
    expect(response.status()).toBe(401)
  })
})

test.describe('App-first portal retirement (credential-free)', () => {
  test('retired portal routes redirect to /open-app regardless of auth state', async ({ page }) => {
    await expectOpenAppRedirect(page, '/coach/dashboard')
    await expectOpenAppRedirect(page, '/athlete/dashboard')
    await expectOpenAppRedirect(page, '/org/settings')
  })

  test('legacy portal query parameters and cookies cannot unlock retired pages', async ({ page }) => {
    await expectOpenAppRedirect(page, '/coach/dashboard?web=1')
    const response = await page.request.get('/athlete/dashboard', {
      maxRedirects: 0,
      headers: { Cookie: 'ch_web_portal=1' },
    })
    expect(response.status()).toBeGreaterThanOrEqual(300)
    expect(response.status()).toBeLessThan(400)
    expect(response.headers().location || '').toContain('/open-app')
  })

  test('admin routes still redirect unauthenticated users to login', async ({ page }) => {
    await expectLoginRedirectResponse(page, '/admin/users')
  })

  test('retained portal workflows are not retired', async ({ page }) => {
    // Billing, payment, and marketplace pages the mobile app deliberately
    // sends users to must never redirect to /open-app.
    const retained = [
      '/athlete/payments',
      '/athlete/settings',
      '/athlete/marketplace/cart',
      '/athlete/marketplace/orders',
      '/coach/settings',
      '/org/settings',
      '/org/billing',
      '/org/payments',
    ]
    for (const path of retained) {
      const res = await page.request.get(path, { maxRedirects: 0 })
      expect(res.headers().location || '', `${path} must not redirect to /open-app`).not.toContain('/open-app')
    }
  })
})

test.describe('Auth/session flows', () => {
  test('login, session persistence, and logout work end-to-end', async ({ page }) => {
    if (!fallbackEmail || !fallbackPassword) {
      const unauthResponse = await page.request.get('/api/roles/available')
      expect(unauthResponse.status()).toBe(401)
      return
    }

    await loginAndExpectSession(page, fallbackEmail!, fallbackPassword!)

    const authedResponse = await page.request.get('/api/roles/available')
    expect(authedResponse.ok()).toBeTruthy()

    await page.reload()
    const persistedResponse = await page.request.get('/api/roles/available')
    expect(persistedResponse.ok()).toBeTruthy()

    await logoutAndExpectSignedOut(page)
  })
})

test.describe('Role access controls - coach', () => {
  test('coach portal pages redirect to /open-app; admin remains blocked', async ({ page }) => {
    if (!process.env.E2E_COACH_EMAIL || !process.env.E2E_COACH_PASSWORD) {
      await expectOpenAppRedirect(page, '/coach/dashboard')
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_COACH_EMAIL!, process.env.E2E_COACH_PASSWORD!)

    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/open-app/)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/open-app/)

    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/admin/)

    await logoutAndExpectSignedOut(page)
  })
})

test.describe('Role access controls - athlete', () => {
  test('athlete portal pages redirect to /open-app; admin remains blocked', async ({ page }) => {
    if (!process.env.E2E_ATHLETE_EMAIL || !process.env.E2E_ATHLETE_PASSWORD) {
      await expectOpenAppRedirect(page, '/athlete/dashboard')
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ATHLETE_EMAIL!, process.env.E2E_ATHLETE_PASSWORD!)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/open-app/)

    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/open-app/)

    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/admin/)

    await logoutAndExpectSignedOut(page)
  })
})

test.describe('Role access controls - admin', () => {
  test('admin is allowed on admin routes', async ({ page }) => {
    if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/)

    await logoutAndExpectSignedOut(page)
  })
})

test.describe('Role access controls - org', () => {
  test('org portal pages redirect to /open-app', async ({ page }) => {
    if (!process.env.E2E_ORG_EMAIL || !process.env.E2E_ORG_PASSWORD) {
      await expectOpenAppRedirect(page, '/org/settings')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ORG_EMAIL!, process.env.E2E_ORG_PASSWORD!)

    await page.goto('/org')
    await expect(page).toHaveURL(/\/open-app/)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/open-app/)

    await logoutAndExpectSignedOut(page)
  })
})
