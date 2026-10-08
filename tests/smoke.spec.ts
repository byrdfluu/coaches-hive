import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verify critical public pages render without crashing.
 * These run against the live dev server and don't require auth.
 */

test.describe('Public pages smoke tests', () => {
  test('home page renders hero and public audience navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-title')).toBeVisible()
    await expect(page.getByRole('link', { name: 'How it works', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Pricing', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Get the app', exact: true }).first()).toBeVisible()
  })

  test('signup page hands off to the app', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL(/\/open-app/)
    await expect(page.getByRole('heading', { name: 'Continue in the app.' })).toBeVisible()
  })

  test('login page hands off to the mobile app', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/open-app/)
    await expect(page.getByRole('heading', { name: 'Continue in the app.' })).toBeVisible()
  })

  test('terms page renders', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible()
  })

  test('privacy page renders', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible()
  })

  test('/open-app renders without error', async ({ page }) => {
    await page.goto('/open-app')
    await expect(page).toHaveURL(/\/open-app/)
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('Redirect guards', () => {
  test('unauthenticated users visiting /athlete/dashboard are redirected to mobile handoff', async ({ page }) => {
    await page.goto('/athlete/dashboard')
    await expect(page).toHaveURL(/\/open-app\?.*(reason=sign_in_required|reason=session_expired)/)
  })

  test('unauthenticated users visiting /coach/dashboard are redirected to mobile handoff', async ({ page }) => {
    await page.goto('/coach/dashboard')
    await expect(page).toHaveURL(/\/open-app\?.*(reason=sign_in_required|reason=session_expired)/)
  })

  test('unauthenticated users visiting /admin are redirected to login', async ({ request }) => {
    const response = await request.get('/admin', { maxRedirects: 0 })
    expect(response.status()).toBeGreaterThanOrEqual(300)
    expect(response.status()).toBeLessThan(400)
    expect(response.headers().location || '').toContain('/admin/login')
  })
})
