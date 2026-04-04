import { test, expect } from '@playwright/test'

test.describe('Guardian accept-invite page', () => {
  test('shows invalid state when no token is in URL', async ({ page }) => {
    // The page checks for token; if absent, sets state to 'invalid' immediately
    await page.route('/api/guardian-invites*', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ valid: false, reason: 'not_found' }) })
    })
    await page.goto('/guardian/accept-invite')
    await expect(page.getByText('Invalid invite link')).toBeVisible()
  })

  test('shows expired state for an expired token', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ valid: false, reason: 'expired' }) })
    })
    await page.goto('/guardian/accept-invite?token=expired-token-abc')
    await expect(page.getByText('Invite expired')).toBeVisible()
    await expect(page.getByText('Ask the athlete to resend the guardian invite')).toBeVisible()
  })

  test('shows already-accepted state for a used token', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ valid: false, reason: 'already_accepted' }) })
    })
    await page.goto('/guardian/accept-invite?token=used-token-abc')
    await expect(page.getByText('Invite already used')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  })

  test('shows registration form for a valid token', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            valid: true,
            guardian_email: 'parent@example.com',
            athlete_name: 'Jordan Smith',
          }),
        })
      } else {
        await route.continue()
      }
    })
    await page.goto('/guardian/accept-invite?token=valid-token-abc')
    await expect(page.getByText('Create your guardian account')).toBeVisible()
    await expect(page.getByText('Jordan Smith')).toBeVisible()
    await expect(page.getByText('parent@example.com')).toBeVisible()
    await expect(page.getByPlaceholder('First name')).toBeVisible()
    await expect(page.getByPlaceholder('Last name')).toBeVisible()
  })

  test('validates required fields on submit', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            valid: true,
            guardian_email: 'parent@example.com',
            athlete_name: 'Jordan Smith',
          }),
        })
      } else {
        await route.continue()
      }
    })
    await page.goto('/guardian/accept-invite?token=valid-token-abc')
    await page.getByRole('button', { name: 'Create guardian account' }).click()
    await expect(page.getByText('First and last name are required.')).toBeVisible()
  })

  test('validates password minimum length', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            valid: true,
            guardian_email: 'parent@example.com',
            athlete_name: 'Jordan Smith',
          }),
        })
      } else {
        await route.continue()
      }
    })
    await page.goto('/guardian/accept-invite?token=valid-token-abc')
    await page.getByPlaceholder('First name').fill('Jane')
    await page.getByPlaceholder('Last name').fill('Doe')
    await page.locator('input[type="password"]').first().fill('short')
    await page.locator('input[type="password"]').last().fill('short')
    await page.getByRole('button', { name: 'Create guardian account' }).click()
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()
  })

  test('shows password mismatch error', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            valid: true,
            guardian_email: 'parent@example.com',
            athlete_name: 'Jordan Smith',
          }),
        })
      } else {
        await route.continue()
      }
    })
    await page.goto('/guardian/accept-invite?token=valid-token-abc')
    await page.locator('input[type="password"]').first().fill('Password123!')
    await page.locator('input[type="password"]').last().fill('DifferentPass!')
    await expect(page.getByText('Passwords do not match.')).toBeVisible()
  })

  test('redirects to verify page on successful account creation', async ({ page }) => {
    await page.route('/api/guardian-invites*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            valid: true,
            guardian_email: 'parent@example.com',
            athlete_name: 'Jordan Smith',
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, code_length: 6 }),
        })
      }
    })
    await page.goto('/guardian/accept-invite?token=valid-token-abc')
    await page.getByPlaceholder('First name').fill('Jane')
    await page.getByPlaceholder('Last name').fill('Doe')
    await page.locator('input[type="password"]').first().fill('Password123!')
    await page.locator('input[type="password"]').last().fill('Password123!')
    await page.getByRole('button', { name: 'Create guardian account' }).click()
    await expect(page).toHaveURL(/\/auth\/verify.*role=guardian/)
  })
})
