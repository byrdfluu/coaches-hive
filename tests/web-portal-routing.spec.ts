import { expect, test } from '@playwright/test'
import { resolveWebPortalPath, webPortalPathForRole } from '../src/lib/webPortalRouting'

test.describe('web portal routing', () => {
  test('maps supported account roles to their web portal', () => {
    expect(webPortalPathForRole('coach')).toBe('/coach/dashboard')
    expect(webPortalPathForRole('athlete')).toBe('/athlete/dashboard')
    expect(webPortalPathForRole('org_admin')).toBe('/org')
    expect(webPortalPathForRole('superadmin')).toBe('/admin')
  })

  test('prefers the active role and falls back through available roles', () => {
    expect(resolveWebPortalPath({
      activeRole: 'athlete',
      baseRole: 'coach',
      roles: ['org_admin'],
    })).toBe('/athlete/dashboard')
    expect(resolveWebPortalPath({
      activeRole: null,
      baseRole: null,
      roles: ['team_manager'],
    })).toBe('/org')
  })

  test('does not invent a portal for unsupported roles', () => {
    expect(webPortalPathForRole('unknown')).toBeNull()
  })
})
