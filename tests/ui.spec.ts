import { test, expect, type Page } from '@playwright/test'

const expectMobileHandoffRedirect = async (path: string, page: Page) => {
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  const location = new URL(response.headers().location || '', 'http://localhost:3000')
  expect(location.pathname).toBe('/open-app')
  expect(location.searchParams.get('from')).toBe(path)
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
  await expect(page).toHaveURL(/\/open-app\?from=%2Fcoach&reason=sign_in_required/)
})

test('athlete portal entry preserves its destination through mobile handoff', async ({ page }) => {
  await page.goto('/athlete')
  await expect(page).toHaveURL(/\/open-app\?from=%2Fathlete&reason=sign_in_required/)
})

test('coach routes remain protected web destinations', async ({ page }) => {
  await expectMobileHandoffRedirect('/coach/dashboard', page)
  await expectMobileHandoffRedirect('/coach/revenue', page)
})

test('athlete routes remain protected web destinations', async ({ page }) => {
  await expectMobileHandoffRedirect('/athlete/settings', page)
  await expectMobileHandoffRedirect('/athlete/marketplace', page)
  await expectMobileHandoffRedirect('/athlete/messages', page)
})
