import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('any non-active cached billing status is refreshed from authoritative storage', () => {
  const source = read('src/lib/middlewareEnforcement.ts')
  expect(source).toContain('!isBillingAccessActive(subscriptionStatus)')
  expect(source).not.toContain("!subscriptionStatus\n    || CANCELED_SUBSCRIPTION_STATUSES.has(subscriptionStatus)")
})

test('browser auth reads are serialized to prevent Supabase lock stealing', () => {
  const source = read('src/lib/supabaseHelpers.ts')
  expect(source).toContain('serializeBrowserAuthOperation')
  expect(source).toContain('serializeBrowserAuthOperation(() => withBrowserAuthRecovery(rawGetSession')
  expect(source).toContain('serializeBrowserAuthOperation(() => withBrowserAuthRecovery(() => rawGetUser')
})

test('known recovered Supabase lock collisions are not reported as Sentry failures', () => {
  const source = read('src/instrumentation-client.ts')
  expect(source).toContain('beforeSend(event, hint)')
  expect(source).toContain('isSupabaseBrowserAuthLockError(hint?.originalException)')
})
