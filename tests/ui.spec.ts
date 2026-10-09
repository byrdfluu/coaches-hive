import { test, expect, type Page } from '@playwright/test'

const expectPortalLoginRedirect = async (path: string, page: Page) => {
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  const location = new URL(response.headers().location || '', 'http://localhost:3000')
  expect(location.pathname).toBe('/login')
  expect(location.searchParams.get('next')).toBe(path)
}

test('home UI renders current hero and role selector', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('hero-title')).toContainText(
    'Coach more.Coordinate less.'
  )

  await expect(page.getByText('Travel sports', { exact: true })).toBeVisible()
  await expect(page.getByText('Club sports', { exact: true })).toBeVisible()
  await expect(page.getByText('School athletics', { exact: true })).toBeVisible()
})

test('coach portal entry preserves its destination through mobile handoff', async ({ page }) => {
  await page.goto('/coach')
  await expect(page).toHaveURL(/\/login\?.*next=/)
})

test('athlete portal entry preserves its destination through mobile handoff', async ({ page }) => {
  await page.goto('/athlete')
  await expect(page).toHaveURL(/\/login\?.*next=/)
})

test('coach routes remain protected web destinations', async ({ page }) => {
  await expectPortalLoginRedirect('/coach/dashboard', page)
  await expectPortalLoginRedirect('/coach/revenue', page)
})

test('athlete routes remain protected web destinations', async ({ page }) => {
  await expectPortalLoginRedirect('/athlete/settings', page)
  await expectPortalLoginRedirect('/athlete/marketplace', page)
  await expectPortalLoginRedirect('/athlete/messages', page)
})
