import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isBillingAccessActive } from '../src/lib/billingState'
import { isMobileBearerAuthApiPath } from '../src/lib/middlewarePolicy'
import { normalizePlatformSubscriptionStatus, platformSubscriptionHasAccess } from '../src/lib/platformSubscription'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('mobile platform subscription contract', () => {
  test('unpaid signup and every non-access Stripe status remain locked', () => {
    for (const status of ['inactive', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired']) {
      expect(platformSubscriptionHasAccess({ status })).toBe(false)
      expect(isBillingAccessActive(status)).toBe(false)
    }
  })

  test('successful active checkout and a non-expired trial grant access', () => {
    expect(platformSubscriptionHasAccess({ status: 'active' })).toBe(true)
    expect(platformSubscriptionHasAccess({ status: 'trialing', trialEnd: new Date(Date.now() + 60_000).toISOString() })).toBe(true)
  })

  test('canceled checkout cannot activate access', () => {
    const completion = source('src/components/MobilePaymentCompletion.tsx')
    expect(completion).toContain("canceled || !token || !sessionId")
    expect(completion).toContain("coacheshive://billing-updated")
    expect(completion.indexOf("payload?.completed")).toBeLessThan(completion.indexOf("coacheshive://billing-updated"))
  })

  test('duplicate webhooks are guarded by Stripe event ID', () => {
    const webhook = source('src/app/api/stripe/webhook/route.ts')
    const migration = source('supabase/stripe_webhook_events.sql')
    expect(webhook).toContain("logError.code === '23505'")
    expect(webhook).toContain("return NextResponse.json({ received: true })")
    expect(migration).toContain('event_id text not null unique')
  })

  test('direct coach and org portal access uses the same active-status rule', () => {
    const enforcement = source('src/lib/middlewareEnforcement.ts')
    expect(enforcement).toContain('resolveDbBillingInfoForActor')
    expect(enforcement).toContain("An active subscription is required to access this area.")
    expect(enforcement).toContain('status: 402')
    expect(isBillingAccessActive('past_due')).toBe(false)
  })

  test('mobile endpoints are bearer-auth deferred and statuses normalize explicitly', () => {
    expect(isMobileBearerAuthApiPath('/api/mobile/subscription/status')).toBe(true)
    expect(isMobileBearerAuthApiPath('/api/mobile/subscription/start')).toBe(true)
    expect(normalizePlatformSubscriptionStatus('cancelled')).toBe('canceled')
    expect(normalizePlatformSubscriptionStatus('unknown')).toBe('inactive')
  })
})
