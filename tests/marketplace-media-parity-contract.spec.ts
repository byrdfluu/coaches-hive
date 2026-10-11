import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('marketplace media persists canonical paths and metadata across mirrored tables', () => {
  const migration = read('supabase/migrations/20261011010000_marketplace_media_contract.sql')
  for (const field of ['media_storage_path','media_filename','media_mime_type','media_size_bytes','image_storage_path','image_filename','image_mime_type','image_size_bytes']) expect(migration).toContain(field)
  expect(migration).toContain('sync_marketplace_media_metadata')
  expect(migration).toContain('never a signed URL')
  expect(migration).toContain('20971520')
  expect(migration).toContain("'product-media', 'product-media', false")
  expect(migration).toContain('product media authorized read')
  expect(migration).toContain('owner_id::text = auth.uid()::text')
})

test('marketplace media metadata syncs in both directions', () => {
  const migration = read('supabase/migrations/20261011010000_marketplace_media_contract.sql')
  expect(migration).toContain("if tg_table_name = 'products'")
  expect(migration).toContain('update public.marketplace_items')
  expect(migration).toContain('update public.products')
  expect(migration).toContain('zz_products_sync_marketplace_media_metadata')
  expect(migration).toContain('zz_marketplace_items_sync_product_media_metadata')
})

test('web seller flows persist metadata and clean failed or replaced uploads', () => {
  const files = [
    'src/app/coach/marketplace/create/page.tsx',
    'src/app/org/marketplace/create/page.tsx',
    'src/app/coach/marketplace/product/[slug]/edit/page.tsx',
    'src/app/org/marketplace/product/[id]/edit/page.tsx',
  ].map(read).join('\n')
  for (const field of ['media_storage_path','media_filename','media_mime_type','media_size_bytes']) expect(files).toContain(field)
  expect(files).toContain("storage.from(PRODUCT_MEDIA_BUCKET).remove")

  const routes = [
    'src/app/api/coach/products/route.ts',
    'src/app/api/coach/products/[id]/route.ts',
    'src/app/api/org/products/route.ts',
    'src/app/api/org/products/[id]/route.ts',
  ].map(read).join('\n')
  expect(routes).toContain('20 * 1024 * 1024')
  for (const field of ['media_storage_path','media_filename','media_mime_type','media_size_bytes']) expect(routes).toContain(field)
})

test('private product media uses authorized signed URLs and cleans exercise objects', () => {
  const migration = read('supabase/migrations/20261011010000_marketplace_media_contract.sql')
  expect(migration).toContain("join public.orders o on o.product_id = cp.product_id")
  expect(migration).toContain("o.status in ('paid', 'active', 'approved')")

  const signer = read('src/lib/productMedia.ts')
  expect(signer).toContain("createSignedUrl(normalized")

  const athletePages = [
    'src/app/athlete/programs/page.tsx',
    'src/app/athlete/programs/[id]/page.tsx',
  ].map(read).join('\n')
  expect(athletePages).toContain('thumbnail_url')
  expect(athletePages).toContain('photo_urls')
  expect(athletePages).not.toContain('getPublicUrl(')

  const exerciseEditor = read('src/components/ExerciseEditorModal.tsx')
  expect(exerciseEditor).toContain('createSignedUrl(path')
  expect(exerciseEditor).toContain('discardPendingUploads')

  const exerciseRoute = read('src/app/api/coach/exercises/[id]/route.ts')
  expect(exerciseRoute).toContain("storage.from('product-media').remove(mediaPaths)")
})
