import { expect, test } from '@playwright/test'
import { Environment, Status } from '@apple/app-store-server-library'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  APPLE_BUNDLE_ID,
  assertAppleAccountTokenOwner,
  productDefinition,
  statusFromAppleNotification,
} from '../src/lib/appleIap'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('Apple IAP contract', () => {
  test('recognizes only the four configured subscription products', () => {
    expect(APPLE_BUNDLE_ID).toBe('com.coacheshive.mobile')
    expect(productDefinition('com.coacheshive.mobile.coachallaccess.monthly')).toEqual({
      planKey: 'coach_all_access', role: 'coach', interval: 'month',
    })
    expect(productDefinition('com.coacheshive.mobile.coachallaccess.annual')).toEqual({
      planKey: 'coach_all_access', role: 'coach', interval: 'year',
    })
    expect(productDefinition('com.coacheshive.mobile.familyallaccess.monthly')).toEqual({
      planKey: 'family_all_access', role: 'athlete', interval: 'month',
    })
    expect(productDefinition('com.coacheshive.mobile.familyallaccess.annual')).toEqual({
      planKey: 'family_all_access', role: 'athlete', interval: 'year',
    })
    expect(productDefinition('com.coacheshive.mobile.orgallaccess.monthly')).toBeNull()
  })

  test('maps Apple lifecycle events without trusting the client', () => {
    const activeTransaction = {
      environment: Environment.PRODUCTION,
      expiresDate: Date.now() + 60_000,
    }
    expect(statusFromAppleNotification({
      notificationType: 'DID_RENEW',
      subscriptionStatus: Status.ACTIVE,
      transaction: activeTransaction,
    })).toBe('active')
    expect(statusFromAppleNotification({
      notificationType: 'DID_FAIL_TO_RENEW',
      subscriptionStatus: Status.BILLING_RETRY,
      transaction: activeTransaction,
    })).toBe('past_due')
    expect(statusFromAppleNotification({
      notificationType: 'REFUND',
      subscriptionStatus: Status.REVOKED,
      transaction: { ...activeTransaction, revocationDate: Date.now() },
    })).toBe('canceled')
    expect(statusFromAppleNotification({
      notificationType: 'EXPIRED',
      subscriptionStatus: Status.EXPIRED,
      transaction: { ...activeTransaction, expiresDate: Date.now() - 1 },
    })).toBe('canceled')
  })

  test('activation accepts only signed transaction and renewal data with a server-resolved actor', () => {
    const activation = source('src/app/api/mobile/subscription/apple/activate/route.ts')
    expect(activation).toContain('signed_transaction')
    expect(activation).toContain('signed_renewal_info')
    expect(activation).toContain('verifyAppleTransaction')
    expect(activation).toContain('verifyAppleRenewalInfo')
    expect(activation).toContain('resolvePlatformActor')
    expect(activation).toContain('Organization subscriptions are Stripe-only')
    expect(activation).not.toContain('body.transaction_id')
    expect(activation).not.toContain('body.product_id')
    expect(activation).not.toContain('body.expires_at')
  })

  test('requires appAccountToken to match the authenticated Supabase user UUID', () => {
    const userId = '7f40a6aa-f90a-4a25-929b-a9f334c66fb4'
    expect(() => assertAppleAccountTokenOwner(userId.toUpperCase(), userId)).not.toThrow()
    expect(() => assertAppleAccountTokenOwner(undefined, userId)).toThrow(/appAccountToken/)
    expect(() => assertAppleAccountTokenOwner('', userId)).toThrow(/appAccountToken/)
    expect(() => assertAppleAccountTokenOwner(
      '0ae60b5f-c174-4dc4-8477-96df956b00fa',
      userId,
    )).toThrow(/appAccountToken/)
    expect(() => assertAppleAccountTokenOwner('not-a-uuid', userId)).toThrow(/appAccountToken/)
  })

  test('server notifications are verified and idempotently persisted', () => {
    const notifications = source('src/app/api/apple/notifications/route.ts')
    expect(notifications).toContain('verifyAppleNotification')
    expect(notifications).toContain("insertError?.code === '23505'")
    expect(notifications).toContain('verifyAppleTransactionForEnvironment')
    expect(notifications).toContain('statusFromAppleNotification')
  })

  test('Stripe start resolves price and role on the server', () => {
    const stripeStart = source('src/app/api/mobile/subscription/start/route.ts')
    expect(stripeStart).toContain('resolvePlatformActor')
    expect(stripeStart).toContain('getAllAccessPriceKeys')
    expect(stripeStart).toContain('billing_interval must be month or year')
    expect(stripeStart).toContain('checkout_url: session.url')
    expect(stripeStart).toContain('expires_at:')
  })
})
