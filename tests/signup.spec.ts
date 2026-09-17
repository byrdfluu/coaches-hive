import { test, expect } from '@playwright/test'

test.describe('App-first signup handoff', () => {
  test('redirects signup requests to the mobile handoff', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL(/\/open-app\?.*reason=web_signup_paused/)
    await expect(page.getByRole('heading', { name: 'Continue in the app.' })).toBeVisible()
  })

  test('preserves invitation and intended-action parameters', async ({ page }) => {
    await page.goto('/signup?role=athlete&ref=invite-123&return_to=%2Fcoaches%2Fcoach-1%3Fintent%3Dbook')
    const url = new URL(page.url())
    expect(url.pathname).toBe('/open-app')
    expect(url.searchParams.get('from')).toContain('ref=invite-123')
    expect(url.searchParams.get('from')).toContain('return_to=')
  })
})
