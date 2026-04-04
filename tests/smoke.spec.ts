import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verify critical public pages render without crashing.
 * These run against the live dev server and don't require auth.
 */

test.describe('Public pages smoke tests', () => {
  test('home page renders hero and role selector', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-title')).toBeVisible()
    await expect(page.getByText('Empowering coaches, supporting athletes')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Coach' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Athlete/Parent' })).toBeVisible()
  })

  test('signup page renders without error', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('login page renders without error', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible()
  })

  test('terms page renders', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: /terms/i })).toBeVisible()
  })

  test('privacy page renders', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: /privacy/i })).toBeVisible()
  })

  test('guardian accept-invite page without token shows invalid state', async ({ page }) => {
    await page.goto('/guardian/accept-invite')
    await expect(page.getByText('Invalid invite link')).toBeVisible()
  })
})

test.describe('Redirect guards', () => {
  test('unauthenticated users visiting /athlete/dashboard are redirected to login', async ({ page }) => {
    await page.goto('/athlete/dashboard')
    // Should land on login or a redirect — not the dashboard
    await expect(page).not.toHaveURL(/\/athlete\/dashboard/)
  })

  test('unauthenticated users visiting /coach/dashboard are redirected to login', async ({ page }) => {
    await page.goto('/coach/dashboard')
    await expect(page).not.toHaveURL(/\/coach\/dashboard/)
  })

  test('unauthenticated users visiting /guardian/dashboard are redirected to login', async ({ page }) => {
    await page.goto('/guardian/dashboard')
    await expect(page).not.toHaveURL(/\/guardian\/dashboard/)
  })
})
