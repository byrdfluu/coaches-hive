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

test('browser callback fallback preserves PKCE fields without custom schemes or token handoff', () => {
  const fallback = source('src/components/SecureMobileCallback.tsx')
  expect(fallback).toContain("'code', 'type', 'state'")
  expect(fallback).toContain('Open Coaches Hive')
  expect(fallback).toContain('Continue on the web')
  expect(fallback).toContain('Request a new link')
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
