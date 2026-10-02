import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('family storefront exposes canonical persisted images for every offering source', () => {
  const route = read('src/app/api/mobile/family/storefront/route.ts')

  expect(route).toContain('image_url: string | null')
  for (const table of ['programs', 'org_tryouts', 'sessions', 'org_training_packages', 'marketplace_items']) {
    expect(route).toContain(`from('${table}')`)
  }
  expect(route).toContain("from('org_fee_assignments')")
  expect(route).toContain("org_fees!inner(id,org_id,title,description,image_url")
  expect(route).toContain("marketplace_items').select('id,name,description,image_url")
  expect(route).toContain('image_url:product.image_url||null')
  expect(route).toContain('image_url:await storefrontImageUrl(item.image_url)')
})

test('storefront images remain tenant scoped, published only, refreshed, and private when necessary', () => {
  const route = read('src/app/api/mobile/family/storefront/route.ts')

  expect(route).toContain(".eq('org_id', orgId)")
  expect(route).toContain(".eq('organization_id', orgId).eq('status', 'published')")
  expect(route).toContain(".eq('status', 'active')")
  expect(route).toContain(".eq('is_active', true)")
  expect(route).toContain(".eq('status', 'published')")
  expect(route).toContain("persisted.startsWith('storage://')")
  expect(route).toContain('.createSignedUrl(path, 60 * 60 * 24 * 7)')
  expect(route).toContain("'Cache-Control':'private, no-store'")
})

test('image persistence is separate from checkout and payment records', () => {
  const migration = read('supabase/migrations/20261002050000_family_storefront_offering_images.sql')
  expect(migration).toContain('never an expiring signed URL')
  expect(migration).not.toContain('payment_transactions')
  expect(migration).not.toContain('checkout_purchase_attempts')
})
