import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { offeringEnrollmentLabel } from '../src/lib/offeringEnrollmentLabel'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('whole enrollment withdrawal uses the canonical RPC and correlated errors', () => {
  const route=read('src/app/api/athlete/org-programs/route.ts')
  expect(route).toContain("rpc('withdraw_family_program_registration'")
  expect(route).toContain('p_offering_id: programId')
  expect(route).toContain('p_athlete_id: athlete.profileId')
  expect(route).not.toContain("program_registrations').update({ status: 'cancelled'")
  expect(route).toContain("'[athlete/org-programs] withdrawal failed'")
  expect(route).toContain('correlatedError(correlationId')
})

test('withdrawal refreshes enrollment and capacity without creating a refund', () => {
  const page=read('src/app/athlete/programs/page.tsx')
  expect(page).toContain('if (response.ok) await reloadAssignedPrograms()')
  expect(page).toContain('No refund or subscription cancellation was created.')
  const storefront=read('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain("['pending','pending_payment','processing','paid','confirmed','registered','active'].includes")
})

test('refund execution preserves the database-approved idempotency key and correlation identity', () => {
  const route=read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).toContain('const approvedKey=parseUuid(row.idempotency_key)')
  expect(route).toContain("fail('IDEMPOTENCY_KEY_CONFLICT'")
  expect(route).toContain('{idempotencyKey:key}')
  for(const field of ['success:true','refund_request_id:requestId','stripe_refund_id:refund.id','amount_cents:Number(refund.amount)','idempotency_key:approvedKey||key','correlation_id:correlationId'])expect(route).toContain(field)
})

test('refund authority uses the active-workspace-aware canonical permission contract', () => {
  const route=read('src/app/api/mobile/refunds/execute/route.ts')
  expect(route).toContain("rpc('can_manage_org_refunds'")
  expect(route).toContain("workspace?.organization_id!==row.org_id")
  expect(route).toContain("rpc('resolve_payment_refund_request'")
})

test('enrollment labels distinguish credits, whole programs, selections, and empty schedules', () => {
  const labels=read('src/lib/offeringEnrollmentLabel.ts')
  for(const text of ['sessions available','Enrolled in program','No dates selected','upcoming session','No upcoming sessions'])expect(labels).toContain(text)
  const storefront=read('src/app/api/mobile/family/storefront/route.ts')
  expect(storefront).toContain('enrollment_label:offeringEnrollmentLabel')
  expect(storefront).toContain("sessions_remaining:['monthly_session_membership','prepaid_session_pack'].includes")
  expect(offeringEnrollmentLabel({attendanceModel:'monthly_session_membership',sessionsRemaining:3})).toBe('3 sessions available')
  expect(offeringEnrollmentLabel({attendanceModel:'fixed_enrollment',registrationStatus:'paid'})).toBe('Enrolled in program')
  expect(offeringEnrollmentLabel({attendanceModel:'fixed_enrollment',hasPublishedOccurrences:true})).toBe('No dates selected')
  expect(offeringEnrollmentLabel({attendanceModel:'fixed_enrollment',hasPublishedOccurrences:true,selectedFutureOccurrences:2})).toBe('2 upcoming sessions selected')
  expect(offeringEnrollmentLabel({attendanceModel:'free'})).toBe('No upcoming sessions')
})
