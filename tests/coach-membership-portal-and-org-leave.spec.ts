import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('coach membership portal authorizes the family and derives all Stripe records server-side', () => {
  const route = source('src/app/api/mobile/memberships/billing-portal/route.ts')
  const service = source('src/lib/coachMembershipBillingPortal.ts')
  expect(route).toContain('getMobileRequestUser(request)')
  expect(route).toContain('body.subscription_id')
  expect(route).not.toMatch(/body\.(stripe_customer_id|stripe_subscription_id|coach_id|athlete_id)/)
  expect(service).toContain("from('coach_membership_subscriptions')")
  expect(service).toContain('userOwnsAthleteProfile')
  expect(service).toContain("loadStripeConnectAccountStatus('coach', membership.coach_id")
  expect(service).toContain('stripe.subscriptions.retrieve')
  expect(service).toContain('stripeSubscription.transfer_data?.destination')
  expect(service).toContain('stripe.billingPortal.sessions.create')
  expect(service).toContain('assertStripeHostedUrl(session.url)')
})

test('guardian ownership and SQL tolerate evolving relationship schemas', () => {
  const ownership = source('src/lib/athleteProfileOwnership.ts')
  const migration = source('supabase/migrations/20260929040000_athlete_leave_organization.sql')
  expect(ownership).toContain("from('athlete_guardian_invitations')")
  expect(ownership).not.toContain("from('guardian_athlete_links')")
  expect(migration).toContain("to_regclass('public.family_members')")
  expect(migration).toContain("to_regclass('public.athlete_guardian_invitations')")
  expect(migration).toContain('public.user_can_manage_athlete')
  expect(migration).not.toContain('public.guardian_athlete_links')
})

test('portal supports platform destination subscriptions and legacy direct connected subscriptions', () => {
  const service = source('src/lib/coachMembershipBillingPortal.ts')
  expect(service).toContain('stripe.subscriptions.retrieve(subscriptionId)')
  expect(service).toContain('{ stripeAccount: connectedAccountId }')
  expect(service).toContain('STRIPE_COACH_MEMBERSHIP_PORTAL_CONFIGURATION_ID')
  expect(service).toContain('membership_not_manageable')
  expect(service).not.toContain('stripe.subscriptions.cancel')
})

test('coach membership webhook remains signed, idempotent, and covers lifecycle events', () => {
  const webhook = source('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain('stripe.webhooks.constructEvent')
  expect(webhook).toContain("from('stripe_webhook_events')")
  expect(webhook).toContain("event.type === 'customer.subscription.paused'")
  expect(webhook).toContain("event.type === 'customer.subscription.resumed'")
  expect(webhook).toContain("event.type === 'invoice.payment_failed'")
  expect(webhook).toContain('syncRefundedCoachMembershipCharge')
  expect(webhook).toContain("{ onConflict: 'plan_id,athlete_id' }")
})

test('organization leave routes use the authoritative workspace and prevent cross-organization access', () => {
  const helper = source('src/lib/organizationLeaveRequests.ts')
  const list = source('src/app/api/mobile/organizations/[orgId]/leave-requests/route.ts')
  const resolve = source('src/app/api/mobile/organizations/[orgId]/leave-requests/[requestId]/resolve/route.ts')
  expect(helper).toContain("expectedType: 'organization'")
  expect(helper).toContain('normalizeUuid(result.workspace.organizationId) !== normalizeUuid(orgId)')
  expect(helper).toContain("workspaceCan(result.workspace, 'manage_members')")
  expect(list).toContain(".eq('org_id', auth.authority.orgId)")
  expect(resolve).toContain(".eq('id', requestId).eq('org_id', auth.authority.orgId)")
  expect(resolve).toContain("leaveRequest.status !== 'pending'")
})

test('leave approval blocks obligations, removes current access, and retains history', () => {
  const route = source('src/app/api/mobile/organizations/[orgId]/leave-requests/[requestId]/resolve/route.ts')
  const migration = source('supabase/migrations/20260929040000_athlete_leave_organization.sql')
  expect(route).toContain('Recurring billing must be canceled first.')
  expect(route).toContain('Resolve unpaid balances and future registrations')
  expect(migration).toContain("delete from public.org_team_members")
  expect(migration).toContain("set status='left'")
  expect(migration).toContain("public.coach_athlete_links set status='inactive'")
  expect(migration).not.toMatch(/delete from public\.(payment|receipt|waiver|attendance)/i)
  expect(migration).toContain("if v_request.status=v_target_status then return v_request")
})

test('leave notifications and audit events are retry-safe', () => {
  const migration = source('supabase/migrations/20260929040000_athlete_leave_organization.sql')
  expect(migration).toContain("'organization_membership'")
  expect(migration).toContain("n.data->>'request_id'=v_request.id::text")
  expect(migration).toContain("n.data->>'decision'=v_target_status")
  expect(migration).toContain("insert into public.org_audit_log")
  expect(migration).toContain('resolved_by=p_actor_user_id')
  expect(migration).toContain('resolved_at=now()')
})
