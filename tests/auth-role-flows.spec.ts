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

test.describe('Active web portals (credential-free)', () => {
  test('protected customer portals send signed-out visitors to login', async ({ page }) => {
    for(const path of ['/coach','/coach/dashboard','/athlete','/athlete/dashboard','/org','/org/settings']){
      await expectLoginRedirectResponse(page,path)
    }
  })

  test('admin routes still redirect unauthenticated users to login', async ({ page }) => {
    await expectLoginRedirectResponse(page, '/admin/users')
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
  test('coach can use the coach web portal; admin remains blocked', async ({ page }) => {
    if (!process.env.E2E_COACH_EMAIL || !process.env.E2E_COACH_PASSWORD) {
      await expectLoginRedirectResponse(page, '/coach/dashboard')
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_COACH_EMAIL!, process.env.E2E_COACH_PASSWORD!)

    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/coach\//)

    await page.goto('/athlete/dashboard')
    await expect(page).not.toHaveURL(/\/athlete\/dashboard/)

    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/admin/)

    await logoutAndExpectSignedOut(page)
  })
})

test.describe('Role access controls - athlete', () => {
  test('athlete can use the athlete web portal; admin remains blocked', async ({ page }) => {
    if (!process.env.E2E_ATHLETE_EMAIL || !process.env.E2E_ATHLETE_PASSWORD) {
      await expectLoginRedirectResponse(page, '/athlete/dashboard')
      await expectLoginRedirectResponse(page, '/admin/users')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ATHLETE_EMAIL!, process.env.E2E_ATHLETE_PASSWORD!)

    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/athlete\//)

    await page.goto('/coach/dashboard')
    await expect(page).not.toHaveURL(/\/coach\/dashboard/)

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
  test('organization users can use the organization web portal', async ({ page }) => {
    if (!process.env.E2E_ORG_EMAIL || !process.env.E2E_ORG_PASSWORD) {
      await expectLoginRedirectResponse(page, '/org/settings')
      return
    }

    await loginAndExpectSession(page, process.env.E2E_ORG_EMAIL!, process.env.E2E_ORG_PASSWORD!)

    await page.goto('/org')
    await expect(page).toHaveURL(/\/org/)

    await page.goto('/athlete/dashboard')
    await expect(page).not.toHaveURL(/\/athlete\/dashboard/)

    await logoutAndExpectSignedOut(page)
  })
})
