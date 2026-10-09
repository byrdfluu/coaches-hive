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

test('temporary Supabase auth rate limits are recovered without an error overlay', () => {
  const helper = read('src/lib/supabaseHelpers.ts')
  const recovery = read('src/lib/authSessionRecovery.ts')
  const instrumentation = read('src/instrumentation-client.ts')
  expect(recovery).toContain('over_request_rate_limit')
  expect(helper).toContain('isSupabaseAuthRateLimitError')
  expect(instrumentation).toContain('isSupabaseAuthRateLimitError')
})

test('admin badge polling is cached and does not refetch on every window focus', () => {
  const sidebar = read('src/components/AdminSidebar.tsx')
  expect(sidebar).toContain('notificationCountsRequest')
  expect(sidebar).toContain('NOTIFICATION_CACHE_MS')
  expect(sidebar).not.toContain("addEventListener('focus'")
})

test('PostHog stays disabled during local development unless explicitly enabled', () => {
  const instrumentation = read('src/instrumentation-client.ts')
  expect(instrumentation).toContain("process.env.NODE_ENV === 'production'")
  expect(instrumentation).toContain("NEXT_PUBLIC_POSTHOG_ENABLED === 'true'")
  expect(instrumentation).toContain('postHogEnabled')
})
