import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('organization threads resolve canonical identity from current and legacy organization keys', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain('row.organization_id ?? row.org_id')
  expect(route).toContain("supabaseAdmin.from('organizations').select('id,name')")
  expect(route).toContain("select('org_id,org_name,profile_image_url')")
  expect(route).toContain("select('organization_id,display_name,status')")
  expect(route).toContain('setting?.org_name || workspace?.display_name')
  expect(route).toContain('setting?.profile_image_url || row.organization_profile_image_url')
})

test('direct threads include their stable participant identity without another request', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain('isDirect = !isOrganization && !league && !isGroup')
  expect(route).toContain('counterpart_user_id: isDirect ? counterpart?.user_id || null : null')
  expect(route).toContain('participant_user_id: isDirect ? counterpart?.user_id || null : null')
  expect(route).toContain("participantName = (participant: any)")
})

test('group and league threads use stable scoped titles instead of arbitrary participants', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain("threadType = isOrganization ? 'organization_contact' : isGroup || league ? 'group' : 'direct'")
  expect(route).toContain("counterparts.map(participantName).sort().join(', ')")
  expect(route).toContain('profile_image_url: preserveVersionedAvatar(identityAvatar)')
})

test('historical duplicate roles are collapsed to one counterpart identity', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain("const key = `${participant.thread_id}:${participant.user_id}`")
  expect(route).toContain('if (seen.has(key)) continue')
  expect(route).toContain('participant.user_id !== user.id')
  expect(route).not.toContain('sender_id ===')
})

test('participant DTO is consistent for missing profiles and legacy roles', () => {
  const route = read('src/app/api/mobile/threads/[threadId]/participants/route.ts')
  expect(route).toContain(".select('id,user_id,role,profiles(full_name,avatar_url)')")
  expect(route).not.toContain('profiles!inner')
  expect(route).toContain("return{id:row.id,user_id:row.user_id,role:row.role||'participant',display_name:profile?.full_name||'Removed user'")
  expect(route).not.toContain('full_name:')
  expect(route).toContain('||null')
})

test('participant records remain distinct when one user has duplicate roles', () => {
  const route = read('src/app/api/mobile/threads/[threadId]/participants/route.ts')
  expect(route).toContain('id:row.id')
  expect(route).not.toContain('new Map((data||[])')
})

test('participant authorization and private cache controls are preserved', () => {
  const route = read('src/app/api/mobile/threads/[threadId]/participants/route.ts')
  expect(route).toContain('requireMobileThread(request, threadId)')
  expect(route).toContain("'Cache-Control':'private, no-store'")
})
