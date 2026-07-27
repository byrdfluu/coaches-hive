import { expect, test } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd(), true)

const hasAppEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const expectLoginRedirect = async (request: { get: Function }, path: string) => {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(new URL(response.headers().location || '', 'http://localhost:3000').pathname).toBe('/admin/login')
}

const expectOpenAppRedirect = async (request: { get: Function }, path: string) => {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBeGreaterThanOrEqual(300)
  expect(response.status()).toBeLessThan(400)
  expect(new URL(response.headers().location || '', 'http://localhost:3000').pathname).toBe('/open-app')
}

test.describe('Middleware-driven route contracts', () => {
  test.skip(!hasAppEnv, 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to run request-level middleware checks.')

  test('admin redirects unauthenticated traffic to login', async ({ request }) => {
    await expectLoginRedirect(request, '/admin')
  })

  test('admin settings redirects unauthenticated traffic to login', async ({ request }) => {
    await expectLoginRedirect(request, '/admin/settings')
  })

  test('org support redirects to the app handoff', async ({ request }) => {
    await expectOpenAppRedirect(request, '/org/support')
  })

  test('org audit redirects to the app handoff', async ({ request }) => {
    await expectOpenAppRedirect(request, '/org/audit')
  })

  test('athlete waiver page remains retained and requires authentication', async ({ request }) => {
    const response = await request.get('/athlete/waivers', { maxRedirects: 0 })
    expect(response.status()).toBeGreaterThanOrEqual(300)
    expect(response.status()).toBeLessThan(400)
    const location = new URL(response.headers().location || '', 'http://localhost:3000')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toContain('/athlete/waivers')
  })

  test('narrow waiver shell is public while waiver APIs retain authentication', async ({ request }) => {
    const pageResponse = await request.get('/waivers')
    expect(pageResponse.status()).toBe(200)
    const apiResponse = await request.get('/api/waivers/pending')
    expect(apiResponse.status()).toBe(401)
  })

  test('legacy public org pages redirect to the canonical organizations route', async ({ request }) => {
    test.slow()
    const response = await request.get('/org/demo-org', { maxRedirects: 0 })
    expect(response.status()).toBeGreaterThanOrEqual(300)
    expect(response.status()).toBeLessThan(400)
    const location = response.headers().location || ''
    expect(new URL(location, 'http://localhost:3000').pathname).toBe('/organizations/demo-org')
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
