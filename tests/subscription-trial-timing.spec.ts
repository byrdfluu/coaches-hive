import { expect, test } from '@playwright/test'
import { BILLING_TRIAL_CHARGE_HOUR, BILLING_TRIAL_TIMEZONE, getTrialChargeTimestamp } from '../src/lib/stripeTrialTiming'

test.describe('subscription trial timing', () => {
  test('charges the morning after trial end during daylight saving time', () => {
    const timestamp = getTrialChargeTimestamp({
      now: new Date('2026-03-29T22:15:00.000Z'),
      trialDays: 7,
    })

    expect(new Date(timestamp * 1000).toISOString()).toBe('2026-04-06T13:00:00.000Z')
  })

  test('charges the morning after trial end during standard time', () => {
    const timestamp = getTrialChargeTimestamp({
      now: new Date('2026-01-10T18:45:00.000Z'),
      trialDays: 7,
    })

    expect(new Date(timestamp * 1000).toISOString()).toBe('2026-01-18T14:00:00.000Z')
  })

  test('uses the configured business timing constants', () => {
    expect(BILLING_TRIAL_TIMEZONE).toBe('America/New_York')
    expect(BILLING_TRIAL_CHARGE_HOUR).toBe(9)
  })
})
