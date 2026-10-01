import { expect, test } from '@playwright/test'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('operating mode migration preserves trainer classification and workspace identity', () => {
  const migration = read('supabase/migrations/20261001030000_team_coach_operating_mode_backend.sql')
  expect(migration).toContain("default 'single_team'")
  for (const signal of ['booking_enabled','booking_url','session_price_cents','services','availability_blocks','coach_membership_plans','marketplace_items','products']) {
    expect(migration).toContain(signal)
  }
  for (const protectedTable of ['business_workspaces','workspace_memberships','teams','athlete_profiles','sessions','messages','payments','documents','stripe_connect_accounts']) {
    expect(migration).not.toContain(`delete from public.${protectedTable}`)
  }
  expect(migration).toContain('operating_mode text')
})

test('owner-only endpoint supports the team private-training toggle', () => {
  const route = read('src/app/api/mobile/coach/operating-mode/route.ts')
  expect(route).toContain("request.headers.get('x-workspace-id')")
  expect(route).toContain("workspace.workspace_type !== 'independent_coach'")
  expect(route).toContain('workspace.owner_user_id !== user.id')
  expect(route).toContain("['single_team', 'both']")
  expect(route).toContain("profile.mode === 'independent_coach'")
  expect(route).toContain("update({ operating_mode: requestedMode")
  expect(route).not.toContain("from('business_workspaces').update")
  expect(route).not.toContain("from('stripe_connect_accounts').update")
})

test('workspace and onboarding responses expose operating mode', () => {
  const migration = read('supabase/migrations/20261001030000_team_coach_operating_mode_backend.sql')
  const onboarding = read('src/app/api/onboarding/profile/route.ts')
  expect(migration).toContain("coalesce(icp.operating_mode,'single_team')")
  expect(onboarding).toContain("select('operating_mode')")
  expect(onboarding).toContain('operating_mode: independentProfile?.operating_mode || null')
})

test('private storefront, discovery, availability, products, and membership checkout require trainer mode', () => {
  const files = [
    'src/app/api/public/coaches/route.ts',
    'src/app/api/mobile/family/coaches/[coachId]/storefront/route.ts',
    'src/app/api/public/coaches/[id]/memberships/route.ts',
    'src/app/api/public/coaches/[id]/products/route.ts',
    'src/app/api/availability/route.ts',
    'src/app/api/athlete/coach-memberships/checkout/route.ts',
  ]
  for (const file of files) {
    const source = read(file)
    expect(source).toMatch(/privateTrainingEnabled|\['independent_coach','both'\]/)
  }
})
