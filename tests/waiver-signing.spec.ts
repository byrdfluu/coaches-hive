import { test, expect } from '@playwright/test'

const MOCK_WAIVER_ID = 'waiver-abc-123'

const mockPendingWaiver = {
  id: MOCK_WAIVER_ID,
  title: 'Youth Sports Participation Waiver',
  body: 'I acknowledge the risks associated with participation in athletic activities...',
  org_name: 'Westside Athletics',
  required_roles: ['athlete'],
  created_at: new Date().toISOString(),
}

test.describe('Waiver signing', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('/api/athlete-access', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ canTransact: true, needsGuardianApproval: false }),
      })
    })
    // Mock pending waivers API
    await page.route('/api/waivers/pending', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ pending: [mockPendingWaiver], signed: [] }),
      })
    })
  })

  test('renders pending waivers section', async ({ page }) => {
    await page.goto('/athlete/waivers')
    await expect(page.getByText('Requires your signature')).toBeVisible()
    await expect(page.getByText('Youth Sports Participation Waiver')).toBeVisible()
    await expect(page.getByText('Westside Athletics')).toBeVisible()
  })

  test('expands waiver when Review & sign is clicked', async ({ page }) => {
    await page.goto('/athlete/waivers')
    await page.getByRole('button', { name: 'Review & sign' }).click()
    await expect(page.getByText('I acknowledge the risks')).toBeVisible()
    await expect(page.getByPlaceholder('Your full name')).toBeVisible()
  })

  test('sign button is disabled until name and checkbox are filled', async ({ page }) => {
    await page.goto('/athlete/waivers')
    await page.getByRole('button', { name: 'Review & sign' }).click()

    const signBtn = page.getByRole('button', { name: 'Sign waiver' })
    // Initially disabled — no name, no checkbox
    await expect(signBtn).toBeDisabled()

    // Fill name only — still disabled without checkbox
    await page.getByPlaceholder('Your full name').fill('Alex Johnson')
    await expect(signBtn).toBeDisabled()

    // Check the checkbox — now enabled
    await page.getByText('I agree this constitutes my legal electronic signature').click()
    await expect(signBtn).toBeEnabled()
  })

  test('signing moves waiver to signed section and shows download record link', async ({ page }) => {
    await page.route('/api/waivers/sign', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto('/athlete/waivers')
    await page.getByRole('button', { name: 'Review & sign' }).click()
    await page.getByPlaceholder('Your full name').fill('Alex Johnson')
    await page.getByText('I agree this constitutes my legal electronic signature').click()
    await page.getByRole('button', { name: 'Sign waiver' }).click()

    // Waiver moves to signed section
    await expect(page.getByText('Signed')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: 'Download record' })).toBeVisible()

    // Download record link points to the correct API route
    const downloadLink = page.getByRole('link', { name: 'Download record' })
    await expect(downloadLink).toHaveAttribute('href', `/api/waivers/${MOCK_WAIVER_ID}/signed-record`)
  })

  test('shows error if sign API fails', async ({ page }) => {
    await page.route('/api/waivers/sign', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Failed to sign waiver.' }),
      })
    })

    await page.goto('/athlete/waivers')
    await page.getByRole('button', { name: 'Review & sign' }).click()
    await page.getByPlaceholder('Your full name').fill('Alex Johnson')
    await page.getByText('I agree this constitutes my legal electronic signature').click()
    await page.getByRole('button', { name: 'Sign waiver' }).click()

    await expect(page.getByText('Failed to sign waiver.')).toBeVisible({ timeout: 5000 })
  })

  test('shows empty state when no pending waivers', async ({ page }) => {
    await page.route('/api/waivers/pending', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ pending: [], signed: [] }),
      })
    })
    await page.goto('/athlete/waivers')
    await expect(page.getByText("No pending waivers. You're all caught up.")).toBeVisible()
  })
})
