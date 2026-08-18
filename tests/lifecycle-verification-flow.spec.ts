import { expect, test } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
import {
  applyLifecycleEvent,
  resolveBillingInfoForLifecycle,
  resolveLifecycleActiveTierFromBilling,
  resolveLifecycleNextPath,
  resolveLifecycleStateForSession,
} from '../src/lib/lifecycleOrchestration'
import { resolveTierForBillingRoleFromPriceId } from '../src/lib/stripeTierResolution'

loadEnvConfig(process.cwd(), true)

test.describe('Lifecycle verification flow', () => {
  test('confirmed email does not stay stuck on awaiting_verification', () => {
    const state = resolveLifecycleStateForSession({
      lifecycleStateHint: 'awaiting_verification',
      emailConfirmed: true,
    })
    expect(state).toBe('verified_pending_plan')

    const nextPath = resolveLifecycleNextPath({
      role: 'coach',
      state,
      selectedTier: 'pro',
    })
    expect(nextPath).toBe('/select-plan?role=coach&tier=individual_coach')
  })

  test('verification with an All Access selection proceeds directly to checkout', () => {
    const cases = [
      { role: 'coach', tier: 'individual_coach' },
      { role: 'org_admin', tier: 'organization' },
    ]

    for (const entry of cases) {
      const metadata = applyLifecycleEvent(
        {
          role: entry.role,
          selected_tier: entry.tier,
          lifecycle_state: 'awaiting_verification',
        },
        'verification_confirmed',
        { tier: entry.tier },
      )

      expect(metadata.lifecycle_state).toBe('plan_selected')
      expect(resolveLifecycleNextPath({
        role: entry.role,
        state: metadata.lifecycle_state,
        selectedTier: metadata.selected_tier,
      })).toBe(`/checkout?role=${entry.role}&tier=${entry.tier}`)
    }
  })

  test('unconfirmed email still routes to verify page', () => {
    const state = resolveLifecycleStateForSession({
      lifecycleStateHint: 'awaiting_verification',
      emailConfirmed: false,
    })
    expect(state).toBe('awaiting_verification')

    const nextPath = resolveLifecycleNextPath({
      role: 'athlete',
      state,
      selectedTier: 'starter',
    })
    expect(nextPath).toBe('/auth/verify?role=athlete')
  })

  test('lifecycle billing prefers live active billing when stored status is stale', async () => {
    const billingInfo = await resolveBillingInfoForLifecycle({
      userId: 'coach-1',
      role: 'coach',
      selectedTierHint: 'pro',
      resolveLiveBillingInfo: async () => ({
        status: 'active',
        tier: 'pro',
        current_period_end: null,
        trial_end: null,
        cancel_at_period_end: false,
      }),
      resolveStoredBillingInfo: async () => ({
        status: null,
        tier: 'pro',
        current_period_end: null,
        trial_end: null,
        cancel_at_period_end: false,
      }),
    })

    expect(billingInfo?.status).toBe('active')
    expect(
      resolveLifecycleActiveTierFromBilling({
        role: 'coach',
        billingInfo: billingInfo!,
      }),
    ).toBe('individual_coach')
  })

  test('lifecycle billing falls back to stored billing when live lookup fails', async () => {
    const billingInfo = await resolveBillingInfoForLifecycle({
      userId: 'coach-2',
      role: 'coach',
      selectedTierHint: 'elite',
      resolveLiveBillingInfo: async () => {
        throw new Error('stripe unavailable')
      },
      resolveStoredBillingInfo: async () => ({
        status: 'active',
        tier: 'elite',
        current_period_end: null,
        trial_end: null,
        cancel_at_period_end: false,
      }),
    })

    expect(billingInfo?.status).toBe('active')
    expect(
      resolveLifecycleActiveTierFromBilling({
        role: 'coach',
        billingInfo: billingInfo!,
      }),
    ).toBe('individual_coach')
  })

  test('lifecycle billing does not activate from a selected tier hint alone', () => {
    expect(
      resolveLifecycleActiveTierFromBilling({
        role: 'coach',
        billingInfo: {
          status: 'active',
          tier: null,
        },
      }),
    ).toBeNull()
  })

  test('stripe coach price IDs can recover tier when subscription metadata is missing', () => {
    const coachProPriceId = process.env.STRIPE_PRICE_COACH_PRO_MONTHLY
    test.skip(!coachProPriceId, 'Missing STRIPE_PRICE_COACH_PRO_MONTHLY')

    expect(resolveTierForBillingRoleFromPriceId('coach', coachProPriceId)).toBe('pro')
  })

  test('lifecycle events normalize tiers against the active org role', () => {
    const nextMetadata = applyLifecycleEvent(
      {
        role: 'coach',
        active_role: 'club_admin',
      },
      'plan_selected',
      { tier: 'growth' },
    )

    expect(nextMetadata.selected_tier).toBe('organization')
    expect(nextMetadata.lifecycle_state).toBe('plan_selected')
  })
})
