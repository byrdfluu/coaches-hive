import { test, expect } from '@playwright/test'

test.describe('Signup form', () => {
  test.describe.configure({ timeout: 60_000 })
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup')
  })

  test('renders role selector and required fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible()
    await expect(page.getByText('I run one team')).toBeVisible()
    await expect(page.getByText("I'm joining as an athlete")).toBeVisible()
    await expect(page.getByText('I manage an organization or league')).toBeVisible()
    await expect(page.getByText("I'm joining as a guardian", { exact: true })).toHaveCount(0)
    await expect(page.locator('input[name="role"]')).toHaveCount(3)
  })

  test('requires a signup path before submission', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  test('shows password mismatch error', async ({ page }) => {
    await page.getByPlaceholder('First name').fill('Jane')
    await page.getByPlaceholder('Last name').fill('Doe')
    // Fill confirm password first so the mismatch state triggers
    await page.locator('input[type="password"]').first().fill('Password123!')
    await page.locator('input[type="password"]').last().fill('DifferentPass!')
    // The mismatch message should appear below confirm password field
    await expect(page.getByText('Passwords do not match.')).toBeVisible()
  })

  test('shows athlete fields when athlete role selected', async ({ page }) => {
    await page.getByText("I'm joining as an athlete").click()
    await expect(page.getByText('Date of birth')).toBeVisible()
    await expect(page.locator('input[type="date"]')).toBeVisible()
  })

  test('shows org fields when org role selected', async ({ page }) => {
    await page.getByText('I manage an organization or league').click()
    await expect(page.getByText('Organization details')).toBeVisible()
    await expect(page.getByText('Organization name')).toBeVisible()
    await expect(page.getByText('Organization type')).toBeVisible()
  })

  test('requires org name and type when org role selected', async ({ page }) => {
    await page.getByPlaceholder('First name').fill('Admin')
    await page.getByPlaceholder('Last name').fill('User')
    await page.getByPlaceholder('example@gmail.com').fill('admin@org.com')
    await page.locator('input[type="password"]').first().fill('Password123!')
    await page.locator('input[type="password"]').last().fill('Password123!')
    await page.getByText('I manage an organization or league').click()
    await page.getByText(/By creating an account/).click()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Organization name is required.')).toBeVisible()
  })
})
