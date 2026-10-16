import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('organization threads resolve canonical identity from current and legacy organization keys', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain('row.organization_id??row.org_id')
  expect(route).toContain("supabaseAdmin.from('organizations').select('id,name')")
  expect(route).toContain("supabaseAdmin.from('org_settings').select('org_id,profile_image_url')")
  expect(route).toContain('setting?.profile_image_url||row.organization_profile_image_url')
})

test('direct threads include their stable participant identity without another request', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain('isDirect=!isOrganization&&!league&&!isGroup')
  expect(route).toContain('participant_user_id:isDirect&&person?.user_id?person.user_id:null')
  expect(route).toContain("profile?.full_name||row.title||'Removed user'")
})

test('group and league threads use stable scoped titles instead of arbitrary participants', () => {
  const route = read('src/app/api/mobile/threads/route.ts')
  expect(route).toContain("league?.name||(isGroup?(row.title||'Group conversation')")
  expect(route).toContain('profile_image_url:preserveVersionedAvatar(identityAvatar)')
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
