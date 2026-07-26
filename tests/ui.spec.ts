import { test, expect, type Page } from '@playwright/test'

const expectOpenAppRedirect = async (path: string, page: Page) => {
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(response.headers().location || '').toContain('/open-app')
}

test('home UI renders current hero and role selector', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('hero-title')).toContainText(
    'Empowering coaches, supporting athletes, and uniting organizations.'
  )

  await expect(page.getByRole('button', { name: 'Coach', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Athlete/Parent', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Organization', exact: true })).toBeVisible()
})

test('coach public page renders key sections', async ({ page }) => {
  await page.goto('/coach')

  await expect(page.getByText('Grow your coaching business without admin drag.')).toBeVisible()
  await expect(page.getByText('Everything you need to run sessions and programs.')).toBeVisible()
})

test('athlete public page renders key sections', async ({ page }) => {
  await page.goto('/athlete')

  await expect(page.getByText('Find the right coach, stay accountable, see progress.')).toBeVisible()
  await expect(page.getByText('Sessions, bundles, and digital plans.')).toBeVisible()
})

test('retired portal coach routes redirect to /open-app', async ({ page }) => {
  await expectOpenAppRedirect('/coach/dashboard', page)
  await expectOpenAppRedirect('/coach/revenue', page)
})

test('retired portal athlete routes redirect to /open-app', async ({ page }) => {
  await expectOpenAppRedirect('/athlete/settings', page)
  await expectOpenAppRedirect('/athlete/marketplace', page)
  await expectOpenAppRedirect('/athlete/messages', page)
})
