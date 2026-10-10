import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('organization invitation forms start without an implicit role', () => {
  const permissions = read('src/app/org/permissions/page.tsx')
  const contacts = read('src/app/org/contacts/page.tsx')

  expect(permissions).toContain("useState<string[]>([])")
  expect(permissions).toContain('disabled={inviteSaving || inviteRoles.length === 0}')
  expect(permissions).toContain('placeholder="name@example.com"')
  expect(permissions).not.toContain("useState('org_admin')")

  expect(contacts).toContain("const [inviteRole, setInviteRole] = useState('')")
  expect(contacts).toContain('disabled={inviteSaving || !inviteRole}')
  expect(contacts).toContain('<option value="" disabled>Select a role</option>')
  expect(contacts).not.toContain("setInviteRole('coach')")
})

test('staff invitation form submits every intentionally selected role', () => {
  const page = read('src/app/org/permissions/page.tsx')

  for (const role of ['org_admin', 'program_director', 'team_manager', 'coach', 'assistant_coach']) {
    expect(page).toContain(`value: '${role}'`)
  }
  expect(page).toContain('roles: inviteRoles')
  expect(page).toContain('role: inviteRoles[0]')
  expect(page).toContain('current.filter((role) => role !== option.value)')
})

test('invite API rejects empty, blank, and unsupported role arrays without a coach fallback', () => {
  const route = read('src/app/api/org/invites/route.ts')

  expect(route).toContain('roles.length === 0')
  expect(route).toContain('suppliedRoles.some((candidate) => !candidate)')
  expect(route).toContain('!INVITABLE_ROLES.has(candidate')
  expect(route).toContain("const role = roles[0] || ''")
  expect(route).not.toMatch(new RegExp("role\\s*=.*\\|\\|\\s*['\"]coach['\"]"))
})

test('single and multi-role invitations persist canonical roles separately from assignments', () => {
  const route = read('src/app/api/org/invites/route.ts')

  expect(route).toContain('const requestedWorkspaceRoles=Array.from(new Set(roles.map(canonicalWorkspaceRole)))')
  expect(route).toContain('requested_workspace_roles: requestedWorkspaceRoles')
  expect(route).toContain('roles,')
  expect(route).toContain('team_id: team_id || null')
})
