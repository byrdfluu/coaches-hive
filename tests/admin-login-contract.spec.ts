import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('private superadmin login contract', () => {
  test('customer login renders a server-backed web portal sign-in form', () => {
    const login = source('src/app/login/page.tsx')
    expect(login).toContain("fetch('/api/auth/login'")
    expect(login).not.toContain('signInWithPassword')
    expect(login).toContain('Sign in to Coaches Hive')
    expect(login).toContain('window.location.replace(destination)')
    expect(login).toContain("fetch('/api/roles/available'")
    expect(login).toContain('resolvePreferredSignInRole')
    expect(login).toContain('activeChoice?.href')
    expect(source('src/app/login/layout.tsx')).toContain('index: false')
  })

  test('admin login requires server-confirmed superadmin access', () => {
    const page = source('src/app/admin/login/page.tsx')
    const layout = source('src/components/AdminLayoutShell.tsx')
    const api = source('src/app/api/auth/login/route.ts')
    expect(page).toContain('admin_only: true')
    expect(page).toContain("window.location.replace('/admin')")
    expect(page).toContain('typeof message === \'string\'')
    expect(page).toContain('setError(getErrorMessage(payload))')
    expect(page).toContain('retry_after')
    expect(page).toContain('Try again in')
    expect(api).toContain('resolveAdminAccess')
    expect(api).toContain("code === 'over_request_rate_limit'")
    expect(api).toContain("'Retry-After': '300'")
    expect(api).toContain('isSuperadmin')
    expect(api).toContain('Superadmin access required')
    expect(layout).toContain("pathname === '/admin/login'")
    expect(layout).toContain('return <>{children}</>')
  })

  test('public header exposes app access without login or signup', () => {
    const header = source('src/components/PublicHeader.tsx')
    expect(header).toContain('GetTheAppButton')
    expect(header).not.toContain('href="/signup"')
    expect(header).not.toContain('href="/login"')
  })

  test('middleware sends unauthenticated admins to the private login', () => {
    const proxy = source('src/proxy.ts')
    expect(proxy).toContain("const signInBase = isAdmin ? '/admin/login' : '/login'")
    expect(proxy).toContain("pathname === '/admin/login'")
  })

  test('local admin login accepts both supported development origins', () => {
    const proxy = source('src/proxy.ts')
    expect(proxy).toContain("'http://localhost:3000'")
    expect(proxy).toContain("'http://127.0.0.1:3000'")
    expect(proxy).toContain("process.env.NODE_ENV === 'production' ? []")
  })
})
