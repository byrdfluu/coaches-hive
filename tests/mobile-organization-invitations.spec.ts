import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('mobile invitation endpoint persists one secure multi-role invitation', () => {
  const route = source('src/app/api/mobile/invitations/route.ts')
  expect(route).toContain("request.headers.get('x-workspace-id')")
  expect(route).toContain("workspaceCan(workspace, 'manage_members')")
  expect(route).toContain('roles,')
  expect(route).toContain("status: 'pending'")
  expect(route).toContain('invite_token_hash: hashInviteToken(token)')
  expect(route).toContain('invitation_code_hash: hashInviteToken(invitationCode)')
  expect(route).toContain('token_expires_at: expiresAt')
  expect(route).not.toContain('invite_token: token')
})

test('mobile invitation email explains the verification flow without exposing the stored invitation code', () => {
  const delivery = source('src/lib/inviteDelivery.ts')
  const route = source('src/app/api/mobile/invitations/route.ts')
  expect(route).toContain('https://app.coacheshive.com/invite/accept?token=')
  expect(delivery).toContain("'Open Coaches Hive'")
  expect(delivery).toContain('Assigned roles:')
  expect(delivery).toContain('I received an invitation')
  expect(delivery).toContain('six-digit verification code sent to your email')
  expect(delivery).toContain('Create your password')
  expect(delivery).toContain('Continue into your workspace')
  expect(delivery).not.toContain('params.invitationCode')
  expect(delivery).toContain('NEXT_PUBLIC_APP_STORE_URL')
  expect(delivery).toContain('This invitation expires')
})

test('invite universal-link web fallback preserves the secure token', () => {
  const page = source('src/app/invite/accept/page.tsx')
  expect(page).toContain('/signup?invite_token=')
  expect(page).toContain('encodeURIComponent(normalizedToken)')
})
