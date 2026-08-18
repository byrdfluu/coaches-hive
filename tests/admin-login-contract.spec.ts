import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('private superadmin login contract', () => {
  test('public login provides account authentication and signup navigation', () => {
    const login = source('src/app/login/page.tsx')
    expect(login).toContain("fetch('/api/auth/login'")
    expect(login).toContain('href="/signup"')
    expect(login).toContain('Sign up')
  })

  test('admin login requires server-confirmed superadmin access', () => {
    const page = source('src/app/admin/login/page.tsx')
    const api = source('src/app/api/auth/login/route.ts')
    expect(page).toContain('admin_only: true')
    expect(page).toContain("window.location.replace('/admin')")
    expect(api).toContain('resolveAdminAccess')
    expect(api).toContain('isSuperadmin')
    expect(api).toContain('Superadmin access required')
  })

  test('public header exposes the login entry point', () => {
    const header = source('src/components/PublicHeader.tsx')
    expect(header).toContain('href="/login"')
    expect(header).toContain('Log in')
  })

  test('middleware sends unauthenticated admins to the private login', () => {
    const proxy = source('src/middleware.ts')
    expect(proxy).toContain("isAdmin ? '/admin/login' : isRetained ? '/login' : '/open-app'")
    expect(proxy).toContain("pathname === '/admin/login'")
  })
})
