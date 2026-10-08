import { expect, test } from '@playwright/test'

const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD

test('signed-in admin data endpoints return their authoritative collections', async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, 'E2E admin credentials are not configured')

  await page.goto('/admin/login')
  await page.getByLabel('Email address').fill(adminEmail!)
  await page.getByLabel('Password').fill(adminPassword!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin(?:\?.*)?$/, { timeout: 30_000 })

  const endpoints = [
    ['/api/admin/metrics', 'users'],
    ['/api/admin/users', 'users'],
    ['/api/admin/athletes', 'athletes'],
    ['/api/admin/coaches', 'coaches'],
    ['/api/admin/orgs', 'orgs'],
    ['/api/admin/verifications?page=1&page_size=25&status=open&include_docs=1', 'queue'],
  ] as const

  for (const [url, key] of endpoints) {
    const response = await page.request.get(url)
    const raw = await response.text()
    expect(response.ok(), `${url}: ${response.status()} ${raw}`).toBeTruthy()
    const payload = JSON.parse(raw)
    expect(payload, url).toHaveProperty(key)
  }
})
