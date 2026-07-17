import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const signupRoute = readFileSync(resolve(process.cwd(), 'src/app/api/auth/signup/route.ts'), 'utf8')

test.describe('organization signup setup contract', () => {
  test('creates org records in the required order before verification', () => {
    const steps = [
      'auth.admin.createUser',
      ".from('profiles').upsert",
      ".insert({ org_type: orgType, status: 'active' })",
      "supabaseAdmin.from('org_settings').insert",
      "supabaseAdmin.from('organization_memberships').insert",
      ".update({ current_org_id: organizationId })",
      'const codeResult = await sendEmailVerificationCode',
    ]
    let previous = -1
    for (const step of steps) {
      const index = signupRoute.indexOf(step)
      expect(index, `${step} should exist`).toBeGreaterThan(previous)
      previous = index
    }
  })

  test('uses schema-safe organization fields and complete related records', () => {
    expect(signupRoute).toContain(".insert({ org_type: orgType, status: 'active' })")
    expect(signupRoute).not.toContain(".insert({ name: orgName, org_type: orgType")
    expect(signupRoute).toContain('primary_contact_email: email')
    expect(signupRoute).toContain("role: 'org_admin'")
    expect(signupRoute).toContain("status: 'active'")
  })

  test('logs actual setup errors and rolls back partial organization state', () => {
    expect(signupRoute).toContain("console.error('[api/auth/signup] account setup failed'")
    expect(signupRoute).toContain("process.env.NODE_ENV === 'development'")
    expect(signupRoute).toContain("from('org_settings').delete()")
    expect(signupRoute).toContain("from('organization_memberships').delete()")
    expect(signupRoute).toContain("from('organizations').delete()")
    expect(signupRoute).toContain('auth.admin.deleteUser(userId)')
  })
})
