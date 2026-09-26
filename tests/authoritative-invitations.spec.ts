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

  test('mobile superadmins can create audited, workspace-scoped multi-role invitations', () => {
    const creation = source('src/app/api/org/invites/route.ts')
    expect(creation).toContain("request.headers.get('x-workspace-id')")
    expect(creation).toContain(".from('business_workspaces')")
    expect(creation).toContain('workspace.organization_id !== org_id')
    expect(creation).toContain('workspacePermissions.manage_members === true')
    expect(creation).toContain('isSuperadminUser(user)')
    expect(creation).toContain('recordWorkspaceAdminAudit')
    expect(creation.indexOf('recordWorkspaceAdminAudit({')).toBeLessThan(creation.indexOf('sendOrgInviteEmail({'))
    for (const code of [
      'not_platform_admin',
      'workspace_not_found',
      'workspace_org_mismatch',
      'missing_manage_members_permission',
    ]) expect(creation).toContain(code)
    expect(creation).not.toContain(".from('organization_memberships')\n    .select('role, status')\n    .eq('org_id', org_id)\n    .eq('user_id', user.id)")
  })

  test('acceptance preserves all invited workspace roles without collapsing program director', () => {
    const creation = source('src/app/api/org/invites/route.ts')
    const approval = source('src/app/api/org/invites/approve/route.ts')
    const migration = source('supabase/migrations/20260925020000_superadmin_multirole_org_invites.sql')
    expect(creation).toContain('const roles = Array.from(new Set([role, ...requestedRoles]')
    expect(creation).toContain('roles,')
    expect(approval).toContain('...invitedRoles')
    expect(migration).toContain('add column if not exists roles text[]')
    expect(migration).toContain('public.workspace_memberships.roles || v_roles')
    expect(migration).toContain("'program_director'")
    expect(migration).not.toContain("program_director','org_admin")
  })

  test('pending guardian records are delivered by the backend worker', () => {
    const worker = source('src/app/api/cron/invite-delivery/route.ts')
    expect(worker).toContain(".from('athlete_guardian_invitations')")
    expect(worker).toContain('sendGuardianInviteEmail')
    expect(worker).toContain("email_delivery_status: delivery.status")
  })
})
