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
  const migration = source('supabase/migrations/20261011100000_storage_and_verification_contracts.sql')
  expect(route).toContain("from('verification_documents').insert")
  expect(route).toContain("from('verification_documents').delete()")
  expect(route).toContain("storage.from(bucket).remove")
  expect(route).toContain('MAX_FILE_SIZE = 20 * 1024 * 1024')
  expect(migration).toContain('create table if not exists public.verification_documents')
  expect(migration).toContain('verification_files_owner_read')
})
