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
  test('preserves the intended cart destination through authentication', async ({ page }) => {
    await seedCart(page)
    await page.goto('/athlete/marketplace/cart')
    await expect(page).toHaveURL(/\/open-app\?.*reason=(?:sign_in_required|session_expired)/)
  })
})
