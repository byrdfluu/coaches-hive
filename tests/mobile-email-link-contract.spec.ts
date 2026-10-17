import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MOBILE_AUTH_CALLBACK_URL, mobileOpenAppUrl, safeNativeDestination } from '../src/lib/mobileLinks'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('uses the universal authentication callback for generated Supabase links', () => {
  expect(MOBILE_AUTH_CALLBACK_URL).toBe('https://app.coacheshive.com/auth/mobile-callback')
  expect(source('src/lib/authVerification.ts')).toContain('MOBILE_AUTH_CALLBACK_URL')
  expect(source('src/app/api/auth/password-reset/route.ts')).toContain('MOBILE_AUTH_CALLBACK_URL')
  expect(source('src/app/athlete/settings/page.tsx')).toContain('emailRedirectTo: MOBILE_AUTH_CALLBACK_URL')
  expect(source('src/app/coach/settings/page.tsx')).toContain('emailRedirectTo: MOBILE_AUTH_CALLBACK_URL')
})

test('production universal-link and Supabase config include mobile password recovery callback', () => {
  const association = source('src/app/.well-known/apple-app-site-association/route.ts')
  const config = source('supabase/config.toml')
  expect(association).toContain("appID: 'YMHDXJZ674.com.coacheshive.mobile'")
  expect(association).toContain("{ '/': '/auth/mobile-callback'")
  expect(config).toContain('"https://app.coacheshive.com/auth/mobile-callback"')
})

test('password reset requests remain non-enumerating and use the mobile callback', () => {
  const route = source('src/app/api/auth/password-reset/route.ts')
  expect(route).toContain("type: 'recovery'")
  expect(route).toContain('options: { redirectTo: buildResetRedirectUrl() }')
  expect(route).toContain("if (isUnknownUserError(message))")
  expect(route).toContain('return NextResponse.json({ sent: true })')
})

test('wraps only approved Coaches Hive destinations for transactional email', () => {
  expect(safeNativeDestination('https://app.coacheshive.com/org/messages?thread=1')).toBe('/org/messages?thread=1')
  expect(safeNativeDestination('https://evil.example/org/messages')).toBe('/org/messages')
  expect(safeNativeDestination('/admin/users')).toBe('/org/messages')
  expect(mobileOpenAppUrl('/athlete/payments')).toBe('https://app.coacheshive.com/open-app?from=%2Fathlete%2Fpayments')
})

test('keeps auth tokens out of custom handoff parameters and analytics', () => {
  const links = source('src/lib/mobileLinks.ts')
  const callback = source('src/app/auth/mobile-callback/page.tsx')
  expect(links).not.toMatch(/access_token|refresh_token/)
  expect(callback).not.toMatch(/posthog|analytics|searchParams/)
  expect(callback).toContain('SecureMobileCallback')
  expect(callback).not.toContain('redirect(appStoreUrl)')
})

test('link-based Supabase templates use provider confirmation links without SiteURL', () => {
  for (const file of ['confirm-signup.html', 'magic-link.html', 'change-email.html', 'invite-user.html']) {
    const html = source(`docs/email-templates/supabase/${file}`)
    expect(html).toContain('{{ .ConfirmationURL }}')
    expect(html).not.toContain('{{ .SiteURL }}')
  }
})

test('password reset email uses the light Coaches Hive palette and an app-owned recovery code', () => {
  const html = source('docs/email-templates/supabase/reset-password.html')
  expect(html).toContain('content="light dark"')
  expect(html).toContain('bgcolor="#b80f0a"')
  expect(html).toContain('color:#fff')
  expect(html).toContain('background:#ffffff')
  expect(html).toContain('{{ .Token }}')
  expect(html).toContain('Coaches Hive password recovery code')
  expect(html).not.toContain('{{ .ConfirmationURL }}')
  expect(html).not.toContain('href="coacheshive://')
  expect(html).toContain('@media(prefers-color-scheme:dark)')
  expect(html).toContain('email-code-panel')
  expect(html).toContain('user-select:all')
  expect(html).not.toContain('background:#232427')
})
