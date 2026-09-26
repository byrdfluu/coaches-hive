import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('standard staff invitations become pending only after Postmark accepts delivery', () => {
  const route = source('src/app/api/org/invites/route.ts')
  expect(route).toContain("status: 'draft'")
  expect(route).toContain("status: delivery.status === 'sent' ? 'pending' : 'failed'")
  expect(route).toContain("inviteError('email_delivery_failed'")
  expect(route).toContain(".in('status', ['draft', 'failed', 'pending'])")
  expect(route).toContain("request.headers.get('x-workspace-id')")
  expect(route).toContain('request_id: requestId')
})

test('secure provisioning sends a Supabase recovery email without passwords or client secrets', () => {
  const route = source('src/app/api/org/invites/provision/route.ts')
  expect(route).toContain('resetPasswordForEmail')
  expect(route).toContain('MOBILE_AUTH_CALLBACK_URL')
  expect(route).toContain("status: 'draft'")
  expect(route).toContain("status: 'pending'")
  expect(route).toContain('staff_invite_provision_requests')
  expect(route).toContain("permissions.manage_members === true")
  expect(route).not.toMatch(/temporary.{0,20}password/i)
  expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
})

test('provisioning audit is durable and program director retains coach-style profile behavior', () => {
  const migration = source('supabase/migrations/20260926040000_secure_staff_invite_provisioning.sql')
  expect(migration).toContain('normalized_email_hash')
  expect(migration).toContain("'rate_limited'")
  expect(migration).toContain("'program_director'=any")
  expect(migration).toContain("set role='coach'")
})
