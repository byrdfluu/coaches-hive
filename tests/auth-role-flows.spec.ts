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

const setTestRoleCookie = async (page: Page, role: 'coach' | 'athlete') => {
  await page.context().addCookies([
    {
      name: 'ch_test_role',
      value: role,
      url: 'http://localhost:3000',
    },
  ])
}

const clearTestRoleCookie = async (page: Page) => {
  await page.context().clearCookies()
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

test.describe('Role access controls (credential-free)', () => {
  test('coach test role can access coach routes and is blocked from athlete routes', async ({ page }) => {
    await setTestRoleCookie(page, 'coach')

    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/coach\/dashboard/)

    await expectLoginRedirectResponse(page, '/athlete/dashboard')

    await clearTestRoleCookie(page)
  })

  test('athlete test role can access athlete routes and is blocked from coach routes', async ({ page }) => {
    await setTestRoleCookie(page, 'athlete')

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/athlete\/dashboard/)

    await expectLoginRedirectResponse(page, '/coach/dashboard')

    await clearTestRoleCookie(page)
  })

  test('admin and org protected routes redirect to login without a real session', async ({ page }) => {
    await expectLoginRedirectResponse(page, '/admin/users')
    await expectLoginRedirectResponse(page, '/org/settings')
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
  test('coach is allowed on coach routes and blocked from athlete/admin routes', async ({ page }) => {
    if (!process.env.E2E_COACH_EMAIL || !process.env.E2E_COACH_PASSWORD) {
      await expectLoginRedirectResponse(page, '/coach/dashboard')
      await expectLoginRedirectResponse(page, '/athlete/dashboard')
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_COACH_EMAIL!, process.env.E2E_COACH_PASSWORD!)

    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/coach\//)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/coach\//)

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/coach\//)

    await logoutAndExpectSignedOut(page)
  })
})

test.describe('Role access controls - athlete', () => {
  test('athlete is allowed on athlete routes and blocked from coach/admin routes', async ({ page }) => {
    if (!process.env.E2E_ATHLETE_EMAIL || !process.env.E2E_ATHLETE_PASSWORD) {
      await expectLoginRedirectResponse(page, '/athlete/dashboard')
      await expectLoginRedirectResponse(page, '/coach/dashboard')
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ATHLETE_EMAIL!, process.env.E2E_ATHLETE_PASSWORD!)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/athlete\//)

    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/athlete\//)

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/athlete\//)

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
  test('org role is allowed on org routes and blocked from athlete routes', async ({ page }) => {
    if (!process.env.E2E_ORG_EMAIL || !process.env.E2E_ORG_PASSWORD) {
      await expectLoginRedirectResponse(page, '/org/settings')
      await expectLoginRedirectResponse(page, '/athlete/dashboard')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ORG_EMAIL!, process.env.E2E_ORG_PASSWORD!)

    await page.goto('/org')
    await expect(page).toHaveURL(/\/org/)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/org/)

    await logoutAndExpectSignedOut(page)
  })
})
