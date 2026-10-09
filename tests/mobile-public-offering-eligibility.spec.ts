import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('a family-authorized secondary athlete can browse public offerings without an organization roster membership', () => {
  const storefront = source('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain('resolveAuthorizedAthleteContext')
  expect(storefront).not.toContain("from('athlete_organization_memberships')")
  expect(storefront).toContain('organization.is_public!==true')
  expect(storefront).toContain("'available' | 'ineligible' | 'pending_payment'")
})

test('marketplace packages retain marketplace checkout identity', () => {
  const storefront = source('src/app/api/mobile/family/storefront/route.ts')
  const checkout = source('src/app/api/mobile/checkout/route.ts')
  expect(storefront).toContain("offering_type:'marketplace_product',offering_id:product.id")
  expect(storefront).not.toContain("packageItem?'training_package':'marketplace_product'")
  expect(storefront).toContain("offering_type:'training_package',offering_id:trainingPackage.id")
  expect(storefront).not.toContain("?'drop_in_package':'training_package'")
  expect(checkout).toContain(".contains('metadata', { athlete_profile_id: athleteProfileId || '' })")
  expect(checkout).toContain("athlete_profile_id: athleteProfileId || ''")
})

test('program and tryout preparation preserve offering eligibility without a roster gate', () => {
  const prepare = source('src/app/api/mobile/family/offerings/prepare/route.ts')
  const checkout = source('src/app/api/mobile/checkout/route.ts')
  expect(prepare).toContain('resolveAuthorizedAthleteContext')
  expect(prepare).toContain("rpc('is_org_program_visible'")
  expect(prepare).toContain('max_participants')
  expect(prepare).not.toContain("from('athlete_organization_memberships')")
  expect(checkout).toContain('userOwnsAthleteProfile')
  expect(checkout).not.toContain("from('athlete_organization_memberships')")
})

test('training package checkout authorizes the athlete and retains tenant, limit, and Stripe readiness checks', () => {
  const route = source('src/app/api/mobile/training-packages/purchase/route.ts')
  expect(route).toContain('userOwnsAthleteProfile')
  expect(route).toContain(".eq('status', 'published')")
  expect(route).toContain('purchase_limit')
  expect(route).toContain("loadStripeConnectAccountStatus('org', purchase.org_id")
  expect(route).not.toContain("from('athlete_organization_memberships')")
})

test('recurring and one-time public offering checkout accept an authorized guardian independent of registration creator', () => {
  const recurring = source('src/app/api/mobile/offerings/recurring-checkout/route.ts')
  const checkout = source('src/app/api/mobile/checkout/route.ts')
  expect(recurring).toContain('resolveAuthorizedAthleteContext')
  expect(recurring).not.toContain('registration.owner_user_id !== input.userId')
  expect(checkout).not.toContain('registration.owner_user_id !== userId')
})

test('forward migration removes roster eligibility while preserving explicit team targeting', () => {
  const migration = source('supabase/migrations/20261003010000_public_offering_family_eligibility.sql')
  expect(migration).toContain('create or replace function public.is_org_program_visible')
  expect(migration).toContain('create or replace function public.prepare_published_org_fee_assignment')
  expect(migration).toContain('drop function if exists public.request_org_training_package_purchase(uuid, uuid)')
  expect(migration).toContain('create function public.request_org_training_package_purchase')
  expect(migration).toContain('organization.is_public = true')
  expect(migration).not.toContain('public.athlete_organization_memberships')
  expect(migration).toContain('public.org_team_members')
  expect(migration).toContain('public.my_accessible_athlete_profiles()')
  expect(migration).not.toMatch(/insert\s+into\s+public\.athlete_organization_memberships/i)
})
