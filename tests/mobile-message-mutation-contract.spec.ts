import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/mobile/messages/[messageId]/route.ts'), 'utf8')

test('mobile message mutation uses the shared durable message record', () => {
  expect(source).toContain("from('messages')")
  expect(source).toContain('requireMobileThread')
  expect(source).toContain("body: content, content, edited_at: editedAt")
  expect(source).toContain("body: '', content: '', deleted_at: deletedAt")
  expect(source).toContain(".is('deleted_at', null)")
})

test('mobile message edit and delete enforce ownership and scoped administration', () => {
  expect(source).toContain('resolved.message.sender_id !== resolved.access.user.id')
  expect(source).toContain('!isSender && !resolved.access.admin')
  expect(source).toContain("'message.edited'")
  expect(source).toContain("'message.deleted'")
})

test('mobile message mutation returns stable private API contracts', () => {
  expect(source).toContain("'Cache-Control': 'private, no-store'")
  expect(source).toContain("'message_content_required'")
  expect(source).toContain("'message_too_long'")
  expect(source).toContain("'message_changed'")
})
