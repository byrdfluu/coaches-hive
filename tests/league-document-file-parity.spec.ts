import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosSource = (path: string) => readFileSync(resolve('/Users/juwan/Desktop/CH App', path), 'utf8')

test('web and iOS persist the same durable league document metadata', () => {
  const route = source('src/app/api/league/documents/files/route.ts')
  const dataRoute = source('src/app/api/league/data/route.ts')
  const ios = iosSource('CH App/LeaguePortal/Documents/LeagueDocumentsView.swift')
  const fields = ['storage_path', 'storage_filename', 'storage_mime_type', 'storage_size_bytes', 'storage_sha256']
  for (const field of fields) {
    expect(route).toContain(field)
    expect(ios).toContain(field)
  }
  expect(dataRoute).toContain("createSignedUrl(path, 300)")
  expect(route).toContain("maximumBytes = 20 * 1024 * 1024")
  expect(route).toContain('await removeObject(storagePath)')
  expect(route).toContain('document.storage_path !== storagePath')
  expect(ios).toContain('LeagueDocumentStorageService().remove(storagePath: uploadedPath)')
  expect(ios).toContain('oldPath != path')
})

test('league metadata migration covers documents and submissions', () => {
  const migration = source('supabase/migrations/20261012030000_league_document_file_metadata.sql')
  expect(migration).toContain('alter table public.league_documents')
  expect(migration).toContain('alter table public.league_document_submissions')
  expect(migration).toContain('storage_size_bytes between 1 and 20971520')
  expect(migration).not.toContain('signed_url')
})

test('league document upload rejects unauthenticated requests', async ({ request }) => {
  const response = await request.post('/api/league/documents/files', {
    multipart: {
      action: 'replace_document_file',
      document_id: crypto.randomUUID(),
      file: { name: 'test.pdf', mimeType: 'application/pdf', buffer: Buffer.from('test') },
    },
  })
  expect(response.status()).toBe(401)
})
