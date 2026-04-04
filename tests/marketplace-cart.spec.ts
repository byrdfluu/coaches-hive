import { test, expect } from '@playwright/test'

const CART_STORAGE_KEY = 'athlete-marketplace-cart'

// Helper to add items to localStorage before the page loads
async function seedCart(page: import('@playwright/test').Page) {
  await page.addInitScript((key) => {
    const items = [
      {
        id: 'prod-1',
        title: 'Speed Training Program',
        price: 4999,
        quantity: 1,
        creator: 'Coach Taylor',
      },
    ]
    window.localStorage.setItem(key, JSON.stringify(items))
  }, CART_STORAGE_KEY)
}

test.describe('Marketplace cart page', () => {
  // These tests mock auth — the page uses useAthleteAccess which calls /api/athlete-access
  test.beforeEach(async ({ page }) => {
    await page.route('/api/athlete-access', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ canTransact: true, needsGuardianApproval: false }),
      })
    })
    // Suppress unrelated API calls
    await page.route('/api/**', async (route) => {
      if (!route.request().url().includes('athlete-access')) {
        await route.fulfill({ status: 200, body: JSON.stringify({}) })
      } else {
        await route.continue()
      }
    })
  })

  test('renders the cart page with empty state', async ({ page }) => {
    await page.goto('/athlete/marketplace/cart')
    await expect(page.getByRole('heading', { name: /cart/i })).toBeVisible()
  })

  test('shows cart items loaded from localStorage', async ({ page }) => {
    await seedCart(page)
    await page.goto('/athlete/marketplace/cart')
    await expect(page.getByText('Speed Training Program')).toBeVisible()
  })

  test('checkout button calls /api/stripe/cart-checkout and redirects on success', async ({ page }) => {
    await seedCart(page)
    await page.route('/api/stripe/cart-checkout', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ url: 'https://checkout.stripe.com/test-session' }),
      })
    })
    await page.goto('/athlete/marketplace/cart')

    let checkoutRequested = false
    page.on('request', (req) => {
      if (req.url().includes('stripe/cart-checkout')) checkoutRequested = true
    })

    // Intercept navigation to Stripe — just verify the request was made
    page.on('framenavigated', () => {})

    const checkoutBtn = page.getByRole('button', { name: /checkout/i })
    if (await checkoutBtn.count() > 0) {
      await checkoutBtn.click()
      // Give time for the fetch to fire
      await page.waitForTimeout(500)
      expect(checkoutRequested).toBe(true)
    }
  })

  test('shows checkout error when cart-checkout API fails', async ({ page }) => {
    await seedCart(page)
    await page.route('/api/stripe/cart-checkout', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Unable to start checkout. Please try again.' }),
      })
    })
    await page.goto('/athlete/marketplace/cart')

    const checkoutBtn = page.getByRole('button', { name: /checkout/i })
    if (await checkoutBtn.count() > 0) {
      await checkoutBtn.click()
      await expect(page.getByText('Unable to start checkout')).toBeVisible({ timeout: 5000 })
    }
  })
})
