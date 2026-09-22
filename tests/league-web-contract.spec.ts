import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('public league profile exposes only the approved public contract', () => {
  const route = source('src/app/api/public/leagues/[leagueId]/route.ts')
  expect(route).toContain(".eq('is_public', true)")
  expect(route).toContain('organization_count')
  for (const privateField of ['athlete_profiles(', 'league_memberships(', 'league_fee_assignments(']) expect(route).not.toContain(privateField)
  expect(route).toContain('public_league_profile')
  expect(source('src/app/leagues/[leagueId]/page.tsx')).toContain('LeaguePublicProfileClient')
})

test('league join requests use authenticated RPCs rather than browser table writes', () => {
  const route = source('src/app/api/leagues/[leagueId]/join/route.ts')
  expect(route).toContain("supabase.rpc('request_to_join_league'")
  expect(route).toContain('session.user.id')
  expect(route).not.toContain(".from('league_join_requests').insert")
  const migration = source('supabase/migrations/20260921039000_league_web_payment_and_public_contract.sql')
  expect(migration).toContain('league_join_request_roster')
  expect(migration).toContain('review_league_join_request')
})

test('league Connect onboarding requires league finance authority and isolated ownership', () => {
  const route = source('src/app/api/mobile/connect/start/route.ts')
  expect(route).toContain("role === 'league'")
  expect(route).toContain('permissions.manage_payments === true')
  expect(route).toContain("ownerType = 'league'")
  expect(route).toContain("completeParams.set('league_id', ownerId)")
  const accounts = source('src/lib/stripeConnectAccounts.ts')
  expect(accounts).toContain("'coach' | 'org' | 'league'")
  expect(accounts).toContain("status.ownerType === 'league' ? status.ownerId : null")
})

test('league fee checkout is server-priced, ownership checked, and idempotent', () => {
  const route = source('src/app/api/mobile/checkout/route.ts')
  expect(route).toContain("type === 'league_fee'")
  expect(route).toContain("body?.record_id || body?.assignment_id")
  expect(route).toContain(".from('league_fee_assignments')")
  expect(route).toContain('userOwnsAthleteProfile')
  expect(route).toContain("['paid','processing','waived','refunded','disputed','deleted']")
  expect(route).toContain('environment does not match this deployment')
  expect(route).toContain('loadStripeConnectAccountStatus(\'league\'')
  expect(route).toContain('idempotencyKey: `league-fee:')
  expect(route).not.toContain('body?.amount')
  expect(route).not.toContain('body?.stripe_account')
})

test('league fee webhook settlement is signature-verified and state-audited', () => {
  const webhook = source('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain('stripe.webhooks.constructEvent')
  expect(webhook).toContain(".from('stripe_webhook_events')")
  expect(webhook).toContain('handleLeagueFeeEvent(event)')
  expect(webhook).toContain("event_type: `fee_payment_${nextStatus}`")
  expect(webhook).toContain("? 'refunded' : 'partial'")
  expect(webhook).toContain("? 'paid' : 'disputed'")
  expect(webhook).toContain('total !== expected')
  expect(webhook).toContain('League fee payment destination or environment mismatch')
  expect(webhook).toContain("event.type === 'checkout.session.expired'")
  expect(webhook).toContain("event.type === 'payment_intent.processing'")
  const accounting = source('src/lib/mobileCheckoutFulfillment.ts')
  expect(accounting).toContain("expand: ['latest_charge.balance_transaction']")
  expect(accounting).toContain('stripe_processing_fee_cents')
  expect(accounting).toContain('recipient_net_amount_cents')
})

test('organization enrollment requirements support waivers and documents', () => {
  const page = source('src/app/org/enrollment/page.tsx')
  expect(page).toContain('required_waiver_ids')
  expect(page).toContain('Required parent documents')
  expect(page).toContain('Required waivers')
  const route = source('src/app/api/org/enrollment/[id]/route.ts')
  expect(route).toContain(".eq('org_id', orgId)")
  expect(route).toContain('updates.required_waiver_ids')
})
