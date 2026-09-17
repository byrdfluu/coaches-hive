import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('private superadmin login contract', () => {
  test('private login provides account authentication without signup navigation', () => {
    const login = source('src/app/login/page.tsx')
    expect(login).toContain('supabase.auth.signInWithPassword')
    expect(login).not.toContain("fetch('/api/lifecycle'")
    expect(login).toContain('Private web access')
    expect(login).not.toContain('/signup')
    expect(source('src/app/login/layout.tsx')).toContain('index: false')
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

  test('public header exposes app access without login or signup', () => {
    const header = source('src/components/PublicHeader.tsx')
    expect(header).toContain('GetTheAppButton')
    expect(header).not.toContain('href="/signup"')
    expect(header).not.toContain('href="/login"')
  })

  test('middleware sends unauthenticated admins to the private login', () => {
    const proxy = source('src/middleware.ts')
    expect(proxy).toContain("const signInBase = isAdmin ? '/admin/login' : '/login'")
    expect(proxy).toContain("pathname === '/admin/login'")
  })
})
