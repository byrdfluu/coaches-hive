import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('compliance upload validates durable metadata and cleans failed files', () => {
  const route = read('src/app/api/storage/attachment/route.ts')

  expect(route).toContain('resolveActiveOrganizationId(userId)')
  expect(route).toContain("'application/pdf'")
  expect(route).toContain('10 * 1024 * 1024')
  expect(route).toContain(".from('org_compliance_uploads')")
  expect(route).toContain("storage.from('attachments').remove([filePath])")
  expect(route).toContain('file_type: file.type')
  expect(route).toContain('file_size: file.size')
})

test('compliance files are listed with fresh URLs and deleted from storage', () => {
  const route = read('src/app/api/org/compliance/uploads/route.ts')
  const page = read('src/app/org/compliance/page.tsx')

  expect(route).toContain(".createSignedUrls(")
  expect(route).toContain(".eq('org_id', auth.orgId)")
  expect(route).toContain("storage.from('attachments').remove([upload.file_path])")
  expect(page).toContain("fetch('/api/org/compliance/uploads'")
  expect(page).toContain('handleDeleteUpload')
})
