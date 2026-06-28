import { expect, test } from '@playwright/test'
import { createMobileCheckoutToken, verifyMobileCheckoutToken } from '../src/lib/mobileCheckoutToken'
import { resolveMobileOnboardingPlan } from '../src/lib/mobileOnboardingPricing'
import { isPublicApiPath } from '../src/lib/middlewarePolicy'

test.describe('mobile checkout security helpers', () => {
  test.beforeEach(() => {
    process.env.MOBILE_CHECKOUT_TOKEN_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters'
  })

  test('round trips signed checkout claims', () => {
    const { token, claims } = createMobileCheckoutToken({
      type: 'fee', userId: 'user-1', resourceId: 'assignment-1', athleteProfileId: 'athlete-1',
    })
    expect(verifyMobileCheckoutToken(token)).toMatchObject({
      nonce: claims.nonce, type: 'fee', userId: 'user-1', resourceId: 'assignment-1',
    })
  })

  test('rejects a tampered token', () => {
    const { token } = createMobileCheckoutToken({ type: 'marketplace', userId: 'user-1', resourceId: 'item-1' })
    const [payload, signature] = token.split('.')
    expect(() => verifyMobileCheckoutToken(`${payload}x.${signature}`)).toThrow('Invalid checkout token')
  })

  test('rejects an expired token', () => {
    const { token } = createMobileCheckoutToken({ type: 'onboarding', userId: 'user-1', role: 'coach', tier: 'pro' }, -1)
    expect(() => verifyMobileCheckoutToken(token)).toThrow('expired')
  })

  test('keeps bearer and token-protected mobile APIs reachable through proxy', () => {
    expect(isPublicApiPath('/api/mobile/checkout')).toBe(true)
    expect(isPublicApiPath('/api/mobile/checkout-token')).toBe(true)
    expect(isPublicApiPath('/api/mobile/payment-status')).toBe(true)
    expect(isPublicApiPath('/api/stripe/fee-checkout')).toBe(true)
  })
})

test.describe('mobile onboarding pricing', () => {
  test('maps coach and organization plans to the existing Stripe configuration', () => {
    expect(resolveMobileOnboardingPlan('coach', 'pro')).toMatchObject({ billingRole: 'coach', tier: 'pro', trialDays: 7 })
    expect(resolveMobileOnboardingPlan('org_admin', 'growth')).toMatchObject({ billingRole: 'org', tier: 'growth', trialDays: 14 })
  })

  test('rejects unsupported onboarding roles', () => {
    expect(resolveMobileOnboardingPlan('athlete', 'free')).toBeNull()
  })
})
