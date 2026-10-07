import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('keeps customer login app-only while providing server-enforced owner access', () => {
  const customerLogin = source('src/app/login/page.tsx')
  const ownerLogin = source('src/app/owner/login/page.tsx')
  const ownerLayout = source('src/app/owner/login/layout.tsx')
  const loginApi = source('src/app/api/auth/login/route.ts')

  expect(customerLogin).toContain("reason: 'mobile_only'")
  expect(ownerLogin).toContain('protected_owner_only: true')
  expect(ownerLogin).not.toContain('admin_only: true')
  expect(ownerLogin).toContain("'/coach/dashboard'")
  expect(ownerLayout).toContain('index: false')
  expect(loginApi).toContain('isProtectedOwnerEmail(data.user.email)')
  expect(loginApi).toContain('Owner web access is not available for this account.')
  expect(loginApi).toContain('await supabase.auth.signOut()')
})
