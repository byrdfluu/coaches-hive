import { test, expect, type Page } from '@playwright/test'

const expectLoginRedirect = async (path: string, page: Page) => {
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(response.headers().location || '').toContain('/login?next=')
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

test('coach portal entry preserves its destination through login', async ({ page }) => {
  await page.goto('/coach')
  await expect(page).toHaveURL(/\/login\?next=%2Fcoach&role=coach/)
})

test('athlete portal entry preserves its destination through login', async ({ page }) => {
  await page.goto('/athlete')
  await expect(page).toHaveURL(/\/login\?next=%2Fathlete&role=athlete/)
})

test('coach routes remain protected web destinations', async ({ page }) => {
  await expectLoginRedirect('/coach/dashboard', page)
  await expectLoginRedirect('/coach/revenue', page)
})

test('athlete routes remain protected web destinations', async ({ page }) => {
  await expectLoginRedirect('/athlete/settings', page)
  await expectLoginRedirect('/athlete/marketplace', page)
  await expectLoginRedirect('/athlete/messages', page)
})
