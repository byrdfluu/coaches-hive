import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

const offeringProperties: Record<string, string[]> = {
  offering_viewed: ['org_id','offering_id','offering_type'],
  offering_athletes_selected: ['org_id','offering_id','offering_type','athlete_count','is_multi_athlete'],
  offering_dates_selected: ['org_id','offering_id','offering_type','occurrence_count'],
  offering_checkout_started: ['org_id','offering_id','offering_type','billing_type','athlete_count','occurrence_count'],
  offering_checkout_canceled: ['org_id','offering_id','offering_type','billing_type'],
  offering_checkout_completed: ['org_id','offering_id','offering_type','billing_type','was_free'],
}

test('web analytics matches the mobile offering event and property allowlists exactly', () => {
  const analytics = read('src/lib/productAnalytics.ts')
  for (const [event, properties] of Object.entries(offeringProperties)) {
    expect(analytics).toContain(`${event}:[${properties.map(property => `'${property}'`).join(',')}]`)
    expect(analytics).toContain(`'${event}'`)
  }
  expect(analytics).not.toMatch(/offering_(?:viewed|athletes_selected|dates_selected|checkout_started|checkout_canceled|checkout_completed):\[[^\]]*(?:name|email|phone)/)
})

test('mobile analytics accepts only client events and strips unapproved properties', () => {
  const route = read('src/app/api/mobile/analytics/route.ts')
  const analytics = read('src/lib/productAnalytics.ts')
  expect(route).toContain('CLIENT_PRODUCT_EVENTS.has(event)')
  expect(route).toContain('captureProductEvent(auth.user.id,event')
  expect(analytics).toContain('if(allowed.has(key)')
  expect(analytics).toContain("['string','number','boolean'].includes(typeof value)")
  const checkout = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(checkout).toContain("captureOfferingEvent('offering_viewed'")
  expect(checkout).toContain("captureOfferingEvent('offering_athletes_selected'")
  expect(checkout).toContain("captureOfferingEvent('offering_dates_selected'")
  expect(checkout).toContain("captureOfferingEvent('offering_checkout_started'")
  expect(checkout).not.toMatch(/captureOfferingEvent\([^\n]+(?:athlete_name|email)/)
})

test('organization reporting uses the canonical database snapshot', () => {
  const route = read('src/app/api/org/reports/snapshot/route.ts')
  const page = read('src/app/org/reports/page.tsx')
  expect(route).toContain("rpc('org_reporting_snapshot'")
  expect(route).toContain('p_org_id: orgId, p_from: from, p_through: through')
  expect(page).toContain("fetch(`/api/org/reports/snapshot?")
  expect(page).toContain('snapshot.collected_revenue_cents')
  expect(page).toContain('snapshot.pending_payments')
  expect(page).toContain('canonicalSnapshot.conversion_percent')
  expect(page).toContain('canonicalSnapshot.coach_utilization_percent')
  expect(page).toContain('canonicalSnapshot.legacy_activity_count')
})

test('database lifecycle events are delivered to PostHog idempotently without PII', () => {
  const route = read('src/app/api/cron/product-lifecycle-analytics/route.ts')
  expect(route).toContain("from('product_lifecycle_events')")
  expect(route).toContain('$insert_id: row.event_key')
  expect(route).toContain('event_key: row.event_key')
  expect(route).toContain('PII_KEY')
  expect(route).toContain('posthog.flush')
  expect(route).not.toContain('athlete_name')
  expect(route).not.toContain('email:')
})

test('payment and credit lifecycle capture remains database-owned', () => {
  const migration = fs.readFileSync('/Users/juwan/Desktop/CH App/supabase/migrations/20261014190000_reporting_and_lifecycle_analytics.sql', 'utf8')
  expect(migration).toContain('capture_payment_lifecycle_event_trigger')
  expect(migration).toContain('capture_offering_credit_lifecycle_event_trigger')
  expect(migration).toContain('capture_training_credit_lifecycle_event_trigger')
  expect(migration).toContain('event_key text not null unique')
  const browser = read('src/components/MultiAthleteOfferingCheckout.tsx')
  expect(browser).not.toContain("posthog.capture('payment_")
  expect(browser).not.toContain("posthog.capture('credit_")
})

test('lifecycle delivery is scheduled and service-role protected', () => {
  const route = read('src/app/api/cron/product-lifecycle-analytics/route.ts')
  const policy = read('src/lib/middlewarePolicy.ts')
  const vercel = read('vercel.json')
  expect(route).toContain('process.env.CRON_SECRET')
  expect(route).toContain('Bearer ${secret}')
  expect(policy).toContain("'/api/cron/product-lifecycle-analytics'")
  expect(vercel).toContain('/api/cron/product-lifecycle-analytics')
})
