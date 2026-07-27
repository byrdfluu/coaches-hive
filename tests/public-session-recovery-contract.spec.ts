import { expect, test } from '@playwright/test'
import { requiresBrowserSessionRecoveryRedirect } from '../src/lib/authSessionRecovery'

test('expired browser sessions do not redirect public marketing pages', () => {
  for (const pathname of ['/', '/organizations', '/coaches', '/athletes', '/pricing', '/about', '/contact']) {
    expect(requiresBrowserSessionRecoveryRedirect(pathname)).toBe(false)
  }
})

test('expired browser sessions still redirect session-protected pages', () => {
  for (const pathname of ['/admin', '/coach/calendar', '/athlete/payments', '/org', '/select-plan', '/checkout']) {
    expect(requiresBrowserSessionRecoveryRedirect(pathname)).toBe(true)
  }
})
