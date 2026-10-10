import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('web message blocking persists to the shared iOS moderation contract', () => {
  const preferences = read('src/app/api/messages/thread-preferences/route.ts')
  expect(preferences).toContain("from('user_blocks').upsert")
  expect(preferences).toContain("from('user_blocks')")
  expect(preferences).toContain(".eq('blocker_id', userId)")
  expect(preferences).toContain(".in('blocked_user_id', otherUserIds)")
})

test('web inbox and sends honor blocks created by either client', () => {
  const inbox = read('src/app/api/messages/inbox/route.ts')
  const send = read('src/app/api/messages/send/route.ts')
  expect(inbox).toContain(".from('user_blocks')")
  expect(inbox).toContain('blockedCounterpartyIds')
  expect(inbox).toContain('other_participant_ids')
  expect(send).toContain(".from('user_blocks')")
  expect(send).toContain('Messaging is unavailable because one of you has blocked the other user.')
})

test('every web portal can submit a durable conversation report', () => {
  const route = read('src/app/api/messages/report/route.ts')
  const control = read('src/components/MessageReportButton.tsx')
  expect(route).toContain("from('thread_participants')")
  expect(route).toContain("from('content_reports')")
  expect(route).toContain("content_type: 'message'")
  expect(route).toContain("status: 'open'")
  expect(control).toContain("fetch('/api/messages/report'")
  for (const page of [
    'src/app/athlete/messages/page.tsx',
    'src/app/coach/messages/page.tsx',
    'src/app/org/messages/page.tsx',
  ]) expect(read(page)).toContain('<MessageReportButton')
})
