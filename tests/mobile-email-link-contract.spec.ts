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
})

test('Supabase templates use provider confirmation links without SiteURL', () => {
  for (const file of ['confirm-signup.html', 'magic-link.html', 'change-email.html', 'reset-password.html', 'invite-user.html']) {
    const html = source(`docs/email-templates/supabase/${file}`)
    expect(html).toContain('{{ .ConfirmationURL }}')
    expect(html).not.toContain('{{ .SiteURL }}')
  }
})
