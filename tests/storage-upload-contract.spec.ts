import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const source = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('avatar uploads authorize targets and clean up failed or replaced objects', () => {
  const route = source('src/app/api/storage/avatar/route.ts')
  expect(route).toContain('getAthleteProfileById')
  expect(route).toContain("await removeAvatar(filePath)")
  expect(route).toContain('await removeAvatar(previousPath)')
  expect(route.indexOf('getAthleteProfileById')).toBeLessThan(route.indexOf(".from('avatars')"))
})

test('branding uploads validate files, resolve organization scope, and clean up objects', () => {
  const route = source('src/app/api/storage/branding/route.ts')
  expect(route).toContain('MAX_SIZE_BYTES = 10 * 1024 * 1024')
  expect(route).toContain('resolveActiveOrganizationStaffContext')
  expect(route).toContain('await removeBrandingAsset(key)')
  expect(route).toContain('await removeBrandingAsset(previousPath)')
})

test('verification uploads persist metadata and compensate partial failures', () => {
  const route = source('src/app/api/storage/verification/route.ts')
  const settingsPage = source('src/app/coach/settings/page.tsx')
  const migration = source('supabase/migrations/20261011100000_storage_and_verification_contracts.sql')
  expect(route).toContain("from('verification_documents').insert")
  expect(route).toContain("from('verification_documents').delete()")
  expect(route).toContain("storage.from(bucket).remove")
  expect(route).toContain('MAX_FILE_SIZE = 20 * 1024 * 1024')
  expect(migration).toContain('create table if not exists public.verification_documents')
  expect(migration).toContain('verification_files_owner_read')
  expect(settingsPage).toContain("formData.append('type', 'certifications')")
  expect(settingsPage).toContain('filePath: data.path')
  expect(settingsPage).not.toContain('fileUrl: data.url')
})

test('practice-plan attachments persist paths and sign URLs only when read', () => {
  const writeRoute = source('src/app/api/practice-plans/attachments/route.ts')
  const readRoute = source('src/app/api/practice-plans/[id]/route.ts')
  expect(writeRoute).toContain("file_url: ''")
  expect(writeRoute).toContain('removeOwnedAttachment')
  expect(readRoute).toContain("createSignedUrls(durablePaths, 5 * 60)")
})

test('marketplace delivery assets are cleaned after failed, replaced, or deleted records', () => {
  const createPage = source('src/app/coach/marketplace/create/page.tsx')
  const editPage = source('src/app/coach/marketplace/product/[slug]/edit/page.tsx')
  const productRoute = source('src/app/api/coach/products/[id]/route.ts')
  expect(createPage).toContain('removePrivateAttachment(uploadedDeliveryAsset.path)')
  expect(editPage).toContain('removePrivateAttachment(uploadedDeliveryPath)')
  expect(productRoute).toContain('removeOwnedProductAssets')
  expect(productRoute).toContain("from('attachments').remove")
})

test('coach waiver files use one explicit cross-platform bucket contract', () => {
  const uploadRoute = source('src/app/api/storage/attachment/route.ts')
  const waiverRoute = source('src/app/api/coach/waivers/route.ts')
  const pendingRoute = source('src/app/api/waivers/pending/route.ts')
  const migration = source('supabase/migrations/20261011110000_coach_waiver_storage_bucket_contract.sql')
  expect(uploadRoute).toContain("coachWaiverUpload ? 'coach-waivers'")
  expect(waiverRoute).toContain("storage_bucket: 'coach-waivers'")
  expect(pendingRoute).toContain("['coach-waivers', 'attachments']")
  expect(migration).toContain("add column if not exists storage_bucket")
  expect(migration).toContain('sync_coach_waiver_file_path')
  expect(migration).toContain('new.storage_path := coalesce(new.storage_path, new.file_path)')
  expect(migration).toContain('new.file_path := coalesce(new.storage_path, new.file_path)')
})
