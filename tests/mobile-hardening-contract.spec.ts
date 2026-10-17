import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { redactSensitiveText, redactTelemetry } from '../src/lib/telemetryRedaction'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('AASA exposes only credential-bearing universal link routes', () => {
  const route = source('src/app/.well-known/apple-app-site-association/route.ts')
  for (const path of ['/auth/mobile-callback', '/auth/mobile-invite', '/auth/invite', '/auth/confirm', '/invite']) {
    expect(route).toContain(`'/': '${path}'`)
  }
  expect(route).not.toContain("coacheshive://")
  expect(route).not.toContain("'/auth/*'")
  expect(route).toContain('YMHDXJZ674.com.coacheshive.mobile')
})

test('browser callback fallback preserves the complete query and gives recovery a mobile-only fallback', () => {
  const fallback = source('src/components/SecureMobileCallback.tsx')
  expect(fallback).toContain('const open = new URL(source.toString())')
  expect(fallback).toContain('web.search = source.search')
  expect(fallback).toContain("source.searchParams.get('error_description')")
  expect(fallback).toContain("source.searchParams.get('error')")
  expect(fallback).toContain("source.searchParams.get('type') === 'recovery'")
  expect(fallback).toContain('Open Coaches Hive')
  expect(fallback).toContain('Continue on the web')
  expect(fallback).toContain('Request a new link')
  expect(fallback).toContain('Your password reset was initiated in the Coaches Hive mobile app.')
  expect(fallback).not.toContain('ALLOWED_QUERY_KEYS')
  expect(fallback).not.toContain('coacheshive://')
  expect(fallback).not.toMatch(/access_token|refresh_token/)
})

test('telemetry redaction removes credentials and fragments', () => {
  expect(redactSensitiveText('https://app.coacheshive.com/auth?code=secret&x=1#access_token=token'))
    .toBe('https://app.coacheshive.com/auth?code=[REDACTED]&x=1#[REDACTED]')
  expect(redactTelemetry({ Authorization: 'Bearer secret', nested: { refresh_token: 'secret' } }))
    .toEqual({ Authorization: '[REDACTED]', nested: { refresh_token: '[REDACTED]' } })
})

test('global hardening covers headers, CORS, body limits, and sensitive throttles', () => {
  const config = source('next.config.js')
  const proxy = source('src/proxy.ts')
  for (const header of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options']) {
    expect(config).toContain(header)
  }
  expect(proxy).toContain('COACHESHIVE_STAGING_ORIGINS')
  expect(proxy).toContain('payload_too_large')
  expect(proxy).toContain("'/upload', '/proof', '/calendar'")
  expect(proxy).toContain('account:${session.user.id}')
})

test('callback responses are non-cacheable and do not send referrers', async ({ request }) => {
  const response = await request.get('/auth/mobile-callback?code=test-code&type=recovery&state=test-state')
  expect(response.ok()).toBeTruthy()
  // Next dev replaces configured no-store with its stricter development no-cache header.
  expect(response.headers()['cache-control']).toMatch(/no-store|no-cache/)
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(response.url()).not.toContain('coacheshive://')
})

test('recovery fallback preserves every callback parameter and never returns to email entry', async ({ page }) => {
  await page.goto('/auth/mobile-callback?code=test-code&type=recovery&state=test-state&error=test-error&error_description=test-description&provider_custom=value')
  await expect(page.getByRole('heading', { name: 'Continue your password reset' })).toBeVisible()
  await expect(page.getByText('This password-recovery link could not be completed.')).toBeVisible()
  const openHref = await page.getByRole('link', { name: 'Open Coaches Hive' }).getAttribute('href')
  const callback = new URL(openHref || '')
  expect(callback.pathname).toBe('/auth/mobile-callback')
  expect(Object.fromEntries(callback.searchParams.entries())).toEqual({
    code: 'test-code', type: 'recovery', state: 'test-state', error: 'test-error',
    error_description: 'test-description', provider_custom: 'value',
  })
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Continue on the web' })).toHaveCount(0)
})

test('valid recovery fallback explains its mobile origin', async ({ page }) => {
  await page.goto('/auth/mobile-callback?code=test-code&type=recovery')
  await expect(page.getByText('Your password reset was initiated in the Coaches Hive mobile app.')).toBeVisible()
})
