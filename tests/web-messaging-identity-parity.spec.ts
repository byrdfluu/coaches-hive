import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('every web inbox discovers threads through the authoritative projection', () => {
  for (const portal of ['athlete', 'coach', 'org']) {
    const page = read(`src/app/${portal}/messages/page.tsx`)
    expect(page).toContain('loadAllAuthoritativeThreads')
    expect(page).not.toContain("fetch('/api/messages/inbox")
  }
  const org = read('src/app/org/messages/page.tsx')
  expect(org).not.toContain(".from('threads')")
})

test('authoritative client paginates, deduplicates, and preserves canonical identity', () => {
  const client = read('src/lib/authoritativeThreadsClient.ts')
  expect(client).toContain("params.set('cursor',cursor)")
  expect(client).toContain('rows.set(thread.thread_id,thread)')
  expect(client).toContain('canonicalThreadId:thread.thread_id')
  expect(client).toContain('organizationId:thread.organization_id')
  expect(client).toContain('avatarUrl:thread.profile_image_url')
})

test('only canonical organization_id enables organization branding', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain('orgId=row.organization_id||null')
  expect(route).toContain('isOrganization=Boolean(orgId)')
  expect(route).not.toContain('row.organization_id||row.org_id')
  expect(route).toContain("display_name:isOrganization?(org?.name||row.organization_display_name||'Organization')")
  expect(route).toContain("league?.name||profile?.full_name||row.title||'Conversation'")
})

test('portal inboxes use canonical names and avatars without manufacturing thread ids', () => {
  for (const portal of ['athlete', 'coach']) {
    const page = read(`src/app/${portal}/messages/page.tsx`)
    expect(page).toContain('thread.avatarUrl')
    expect(page).toContain('toLegacyInboxThread(thread)')
  }
  const org = read('src/app/org/messages/page.tsx')
  expect(org).toContain('title: thread.display_name')
  expect(org).toContain('profile_image_url: thread.profile_image_url')
  expect(org).toContain('id: thread.thread_id')
})

test('personal and organization conversation identity remain distinct at creation', () => {
  const route = read('src/app/api/mobile/messaging/conversations/route.ts')
  expect(route).toContain("type==='organization'?recipient.organization_id:null")
  expect(route).toContain('p_sender_organization_id:senderOrganizationId')
  expect(route).toContain("expectedType:'organization'")
  expect(route).toContain('threadOrganizationId')
})
