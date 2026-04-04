import { expect, test } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd(), true)

const hasAppEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const expectLoginRedirect = async (request: { get: Function }, path: string) => {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(response.headers().location || '').toContain('/login')
}

test.describe('Middleware-driven route contracts', () => {
  test.skip(!hasAppEnv, 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to run request-level middleware checks.')

  test('admin redirects unauthenticated traffic to login', async ({ request }) => {
    await expectLoginRedirect(request, '/admin')
  })

  test('admin settings redirects unauthenticated traffic to login', async ({ request }) => {
    await expectLoginRedirect(request, '/admin/settings')
  })

  test('org support redirects unauthenticated traffic to login', async ({ request }) => {
    await expectLoginRedirect(request, '/org/support')
  })

  test('org audit redirects unauthenticated traffic to login', async ({ request }) => {
    await expectLoginRedirect(request, '/org/audit')
  })

  test('legacy public org pages redirect to the canonical organizations route', async ({ request }) => {
    test.slow()
    const response = await request.get('/org/demo-org', { maxRedirects: 0 })
    expect(response.status()).toBeGreaterThanOrEqual(300)
    expect(response.status()).toBeLessThan(400)
    const location = response.headers().location || ''
    expect(new URL(location).pathname).toBe('/organizations/demo-org')
  })

  test('public org API stays public even when the slug is missing', async ({ request }) => {
    const response = await request.get('/api/org/public?slug=demo-org', { maxRedirects: 0 })
    expect([200, 404]).toContain(response.status())
    expect(response.status()).not.toBe(401)
    expect(response.status()).not.toBe(403)
    expect(response.headers().location || '').not.toContain('/login')
  })

  test('private membership API still rejects unauthenticated traffic with JSON 401', async ({ request }) => {
    const response = await request.get('/api/memberships')
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.error).toMatch(/unauthorized/i)
  })
})
