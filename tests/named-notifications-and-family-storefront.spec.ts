import { expect, test } from '@playwright/test'
import fs from 'node:fs'

const read=(path:string)=>fs.readFileSync(path,'utf8')

test('shared notification producer resolves authorized actor subject and athlete names',()=>{
  const producer=read('src/lib/notificationProducers.ts')
  for(const field of ['actor_user_id','actor_name','subject_user_id','subject_name','athlete_profile_id','athlete_name'])expect(producer).toContain(field)
  expect(producer).toContain("from('profiles').select('id,full_name')")
  expect(producer).toContain("from('athlete_profiles').select('id,full_name,owner_user_id')")
  expect(producer).toContain('interpolateParticipantNames')
})

test('invite acceptance migration names participants and safely backfills recent rows',()=>{
  const migration=read('supabase/migrations/20260930220000_notification_participant_names.sql')
  expect(migration).toContain("v_name||' accepted your organization invite.'")
  expect(migration).toContain("n.created_at>=now()-interval '90 days'")
  expect(migration).toContain("on conflict(user_id,deduplication_key) do nothing")
  expect(migration).toContain('self_enrollment_enabled')
})

test('booking and review notifications derive names rather than trusting generic or client labels',()=>{
  const booking=read('src/lib/mobileBookingActions.ts')
  const review=read('src/app/api/reviews/route.ts')
  expect(booking).toContain("Coach {actor_name} canceled {athlete_name}'s session.")
  expect(booking).toContain('athleteProfileId')
  expect(review).toContain('reviewerAthlete?.full_name')
  expect(review).not.toContain("reviewer_name || 'An athlete'")
})

test('family organization storefront is athlete-authorized and excludes inactive inventory',()=>{
  const route=read('src/app/api/mobile/family/storefront/route.ts')
  expect(route).toContain('resolveAuthorizedAthleteContext')
  expect(route).toContain('ATHLETE_PROFILE_UNAVAILABLE')
  expect(route).not.toContain("request.headers.get('x-workspace-id')")
  expect(route).not.toContain("from('athlete_organization_memberships')")
  expect(route).toContain("eq('status', 'active')")
  expect(route).toContain("eq('status', 'published')")
  expect(route).toContain("eq('is_active', true)")
  expect(route).toContain(".eq('athlete_id', athlete.profileId)")
  expect(route).toContain('self_enrollment_enabled')
  for(const type of ['organization_fee','recurring_plan','tryout','bookable_session','training_package','marketplace_product'])expect(route).toContain(type)
  for(const field of ['offering_type','offering_id','organization_id','amount_cents','billing_interval','athlete_eligibility','checkout_required','checkout_available'])expect(route).toContain(field)
})

test('family-only cleanup removes staff access without deleting athlete history',()=>{
  const migration=read('supabase/migrations/20260930203000_make_jasebird8_family_only.sql')
  expect(migration).toContain('drop function if exists public.sync_guardian_links_from_profile() cascade')
  expect(migration).toContain("lower(trim(email)) = 'jasebird8@gmail.com'")
  for(const table of ['org_team_coaches','organization_memberships','workspace_memberships','independent_coach_profiles','active_workspace_preferences'])expect(migration).toContain(table)
  for(const protectedTable of ['athlete_profiles','athlete_organization_memberships','program_registrations','sessions','payments'])expect(migration).not.toContain(`delete from public.${protectedTable}`)
})

test('coach storefront routes organization coaches and exposes active independent offerings',()=>{
  const route=read('src/app/api/mobile/family/coaches/[coachId]/storefront/route.ts')
  expect(route).toContain("mode:'organization'")
  expect(route).toContain('/api/mobile/family/storefront?organization_id=')
  expect(route).toContain("mode:'independent_coach'")
  for(const type of ['coach_membership','bookable_session','training_package'])expect(route).toContain(type)
})

test('family self-enrollment reserves an assignment before recurring checkout',()=>{
  const route=read('src/app/api/mobile/recurring-fees/start/route.ts')
  const createOffer=read('src/app/api/mobile/org/recurring-fee-offers/route.ts')
  const updateOffer=read('src/app/api/mobile/org/recurring-fee-offers/[offerId]/route.ts')
  expect(route).toContain("eq('self_enrollment_enabled', true)")
  expect(route).toContain("onConflict: 'offer_id,athlete_id'")
  expect(route).toContain('authorizeRecurringFeePayer')
  expect(route).toContain("status: 'checkout_pending'")
  expect(createOffer).toContain('self_enrollment_enabled:selfEnrollmentEnabled')
  expect(updateOffer).toContain('patch.self_enrollment_enabled')
})
