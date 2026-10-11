import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(file, 'utf8')

test('message attachments use one private durable storage contract', () => {
  const migration = read('supabase/migrations/20261011030000_message_attachment_contract.sql')
  expect(migration).toContain("'private-athlete-media','private-athlete-media',false,209715200")
  expect(migration).toContain('file_path text not null')
  expect(migration).toContain('Signed URLs must be generated at read time and never persisted')
  expect(migration).toContain('public.is_thread_participant(m.thread_id)')
  for (const mime of ['image/jpeg', 'application/pdf', 'video/mp4', 'video/quicktime']) {
    expect(migration).toContain(mime)
  }
})

test('web upload and send persist paths and clean failed writes', () => {
  const upload = read('src/app/api/storage/attachment/route.ts')
  const send = read('src/app/api/messages/send/route.ts')
  expect(upload).toContain("scope === 'message'")
  expect(upload).toContain("`${userId}/messages/${crypto.randomUUID()}")
  expect(upload).toContain('createSignedUrl(filePath, 5 * 60)')
  expect(send).toContain('attachment_storage_path: attachmentPath')
  expect(send).toContain('file_path: attachmentPath')
  expect(send).toContain('file_url: attachmentPath')
  expect(send).not.toContain('file_url: attachment.url')
  expect(send).toContain('cleanupPendingAttachment')
  expect(send).toContain("storage.from('private-athlete-media').remove([attachmentPath])")
})

test('all web message readers mint fresh five-minute URLs', () => {
  for (const file of [
    'src/app/api/messages/conversation/route.ts',
    'src/app/api/mobile/threads/[threadId]/attachments/route.ts',
    'src/app/api/org/messages/thread/route.ts',
  ]) {
    const source = read(file)
    expect(source).toContain('createSignedUrl')
    expect(source).toContain('300')
  }
  const orgPage = read('src/app/org/messages/page.tsx')
  expect(orgPage).toContain('/api/messages/conversation?thread_ids=')
  expect(orgPage).not.toContain(".from('message_attachments')")
})

test('athlete coach and organization upload controls declare message scope', () => {
  for (const file of [
    'src/app/athlete/messages/page.tsx',
    'src/app/coach/messages/page.tsx',
    'src/app/org/messages/page.tsx',
  ]) {
    expect(read(file)).toContain("append('scope', 'message')")
  }
})
