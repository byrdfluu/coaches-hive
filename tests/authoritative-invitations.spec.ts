import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInviteToken, hashInviteToken } from '../src/lib/inviteTokens'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('authoritative organization invitations', () => {
  test('uses high-entropy one-time tokens and stores only their hash', () => {
    const first = createInviteToken()
    const second = createInviteToken()
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(40)
    expect(hashInviteToken(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashInviteToken(first)).not.toContain(first)
  })

  test('coach email carries only the secure token and required copy', () => {
    const delivery = source('src/lib/inviteDelivery.ts')
    expect(delivery).toContain('https://app.coacheshive.com/signup?invite_token=')
    expect(delivery).toContain('added you to <strong>${escapeHtml(normalizedOrgName)}</strong> on Coaches Hive as a')
    expect(delivery).not.toContain('/signup?role=${roleForSignup}')
  })

  test('acceptance cannot substitute an organization through request or URL parameters', () => {
    const route = source('src/app/api/invitations/accept/route.ts')
    const migration = source('supabase/migrations/20260917090000_authoritative_invitation_tokens.sql')
    expect(route).toContain("body?.invite_token")
    expect(route).not.toContain('body?.organization_id')
    expect(route).not.toContain('searchParams')
    expect(migration).toContain('values(r.org_id,p_user_id,r.role')
    expect(migration).toContain('where organization_id=r.org_id')
  })

  test('different organizations remain scoped to their own immutable invitation row', () => {
    const creation = source('src/app/api/org/invites/route.ts')
    const migration = source('supabase/migrations/20260917090000_authoritative_invitation_tokens.sql')
    expect(creation).toContain('org_id: authoritativeOrg.id')
    expect(creation).toContain('organization_name: authoritativeOrg.name')
    expect(creation).toContain('invited_by: user.id')
    expect(migration).toContain('where invite_token_hash=p_token_hash')
    expect(migration).toContain('where org_id=r.org_id and user_id=p_user_id')
  })

  test('pending guardian records are delivered by the backend worker', () => {
    const worker = source('src/app/api/cron/invite-delivery/route.ts')
    expect(worker).toContain(".from('athlete_guardian_invitations')")
    expect(worker).toContain('sendGuardianInviteEmail')
    expect(worker).toContain("email_delivery_status: delivery.status")
  })
})

