import { test, expect } from '@playwright/test'

test.describe('Signup form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup')
  })

  test('renders role selector and required fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible()
    await expect(page.getByText("I'm a Coach")).toBeVisible()
    await expect(page.getByText("I'm an Athlete")).toBeVisible()
    await expect(page.getByText("I'm creating an Organization")).toBeVisible()
    // Guardian is NOT a self-signup option
    await expect(page.getByText(/guardian/i)).not.toBeVisible()
  })

  test('shows error when no role is selected and form is submitted', async ({ page }) => {
    await page.getByPlaceholder('First name').fill('Jane')
    await page.getByPlaceholder('Last name').fill('Doe')
    await page.getByPlaceholder('example@gmail.com').fill('jane@example.com')
    await page.locator('input[type="password"]').first().fill('Password123!')
    await page.locator('input[type="password"]').last().fill('Password123!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Please select Coach, Athlete/Parent, or Organization')).toBeVisible()
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
    await page.getByText("I'm an Athlete").click()
    await expect(page.getByText('Athlete details')).toBeVisible()
    await expect(page.getByText('Account owner')).toBeVisible()
    await expect(page.getByText('Athlete birthdate')).toBeVisible()
  })

  test('shows guardian fields when athlete_minor is selected', async ({ page }) => {
    await page.getByText("I'm an Athlete").click()
    await page.locator('select').first().selectOption('athlete_minor')
    await expect(page.getByText('Guardian name')).toBeVisible()
    await expect(page.getByText('Guardian email')).toBeVisible()
    await expect(page.getByText('Guardian phone')).toBeVisible()
  })

  test('rejects guardian email same as athlete email', async ({ page }) => {
    await page.getByPlaceholder('First name').fill('Alex')
    await page.getByPlaceholder('Last name').fill('Smith')
    await page.getByPlaceholder('example@gmail.com').fill('alex@example.com')
    await page.locator('input[type="password"]').first().fill('Password123!')
    await page.locator('input[type="password"]').last().fill('Password123!')
    await page.getByText("I'm an Athlete").click()
    await page.locator('select').first().selectOption('athlete_minor')
    await page.getByPlaceholder('Parent/guardian name').fill('Parent Smith')
    await page.getByPlaceholder('parent@example.com').fill('alex@example.com')
    await page.getByPlaceholder('+1 (555) 123-4567').fill('5551234567')
    // Set a birthdate for a minor
    await page.locator('input[type="date"]').fill('2015-01-01')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Guardian email must be different from the athlete email')).toBeVisible()
  })

  test('shows org fields when org role selected', async ({ page }) => {
    await page.getByText("I'm creating an Organization").click()
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
    await page.getByText("I'm creating an Organization").click()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Organization name is required.')).toBeVisible()
  })
})
