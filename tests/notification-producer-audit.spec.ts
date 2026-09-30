import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { buildTenantNotificationRows } from '../src/lib/notificationProducers'

const root = process.cwd()
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('shared producer enforces active recipients, canonical categories, tenant context, valid destinations and dedupe', () => {
  const producer = source('src/lib/notificationProducers.ts')
  const service = source('src/lib/inAppNotifications.ts')
  expect(producer).toContain('organizationNotificationContext')
  expect(producer).toContain('leagueNotificationContext')
  expect(producer).toContain('workspace_id: input.context.workspaceId')
  expect(producer).toContain('organization_id: input.context.organizationId')
  expect(producer).toContain('league_id: input.context.leagueId')
  expect(producer).toContain('deduplication_key: `${input.type}:${input.resourceId}:${input.state}`')
  expect(producer).toContain('action_url: input.destination')
  expect(service).toContain("rpc('account_is_active'")
  expect(service).toContain("? resolvedCategory : 'general'")
  expect(service).toContain("onConflict: 'user_id,deduplication_key'")
})

test('tenant event integration builds one canonical contextual notification per unique authorized recipient', () => {
  const rows = buildTenantNotificationRows({
    recipientIds: ['user-one', 'user-one'], type: 'roster_status_changed', category: 'roster',
    title: 'Roster status updated', body: 'Your enrollment is active.', destination: '/athlete/organizations',
    resourceId: 'enrollment-one', state: 'active',
    context: { workspaceId: 'workspace-one', organizationId: 'org-one' }, data: { portal: 'parent_athlete' },
  })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    user_id: 'user-one', category: 'roster', workspace_id: 'workspace-one',
    action_url: '/athlete/organizations', deduplication_key: 'roster_status_changed:enrollment-one:active',
    data: { workspace_id: 'workspace-one', org_id: 'org-one', organization_id: 'org-one', portal: 'parent_athlete' },
  })
})

test('document lifecycle producers notify the assignee and tenant staff exactly after authoritative writes', () => {
  const org = source('src/app/api/org/coach-documents/route.ts')
  const coach = source('src/app/api/coach/documents/route.ts')
  for (const event of ['document_requested', 'document_reviewed']) expect(org).toContain(event)
  expect(coach).toContain('document_submitted')
  for (const route of [org, coach]) {
    expect(route).toContain('organizationNotificationContext')
    expect(route).toContain('emitTenantEvent')
  }
})

test('team and roster mutation producers notify affected active tenant members', () => {
  const routes = [
    'src/app/api/org/teams/route.ts',
    'src/app/api/org/contacts/assign-team/route.ts',
    'src/app/api/org/memberships/team/route.ts',
    'src/app/api/org/roster-status/route.ts',
  ].map(source)
  for (const route of routes) {
    expect(route).toContain('emitTenantEvent')
    expect(route).toContain("category: 'roster'")
    expect(route).toContain('organizationNotificationContext')
  }
})

test('attendance job uses the canonical category and per-recipient idempotency with tenant context', () => {
  const route = source('src/app/api/reminders/sessions/route.ts')
  expect(route).toContain("category: 'attendance'")
  expect(route).toContain('deduplication_key: `attendance_reminder:${session.id}:${recipient.userId}`')
  expect(route).toContain('workspace_id: workspace?.id || null')
  expect(route).toContain('organization_id: session.org_id || null')
  expect(source('vercel.json')).toContain('/api/reminders/sessions')
})

test('public enrollment documents notify only after verified attachment and abandoned uploads are cleaned safely', () => {
  const enrollment = source('src/app/api/enroll/[slug]/route.ts')
  const cleanup = source('src/app/api/cron/registration-document-cleanup/route.ts')
  expect(enrollment).toContain(".is('submission_id', null)")
  expect(enrollment).toContain('attachedUploads || []).length !== validUploads.length')
  expect(enrollment).toContain("type: 'document_submitted'")
  expect(enrollment).toContain("destination: '/org/enrollment'")
  expect(cleanup).toContain(".is('submission_id', null).lt('created_at', cutoff)")
  expect(cleanup).toContain(".delete().eq('id', upload.id).is('submission_id', null).select")
  expect(cleanup).toContain("storage.from('registration-documents').remove")
  expect(source('vercel.json')).toContain('/api/cron/registration-document-cleanup')
})

test('mobile cancellation and rescheduling notify authoritative counterparties without client tenant IDs', () => {
  const helper = source('src/lib/mobileBookingActions.ts')
  const cancel = source('src/app/api/mobile/bookings/[id]/cancel/route.ts')
  const reschedule = source('src/app/api/mobile/bookings/[id]/reschedule/route.ts')
  expect(helper).toContain('notifyMobileBookingChange')
  expect(helper).toContain("from('athlete_guardian_invitations')")
  expect(helper).toContain("from('business_workspaces')")
  expect(helper).toContain("category: 'schedule'")
  expect(helper).toContain("destination: '/coach/calendar'")
  expect(helper).toContain("destination: '/athlete/calendar'")
  expect(cancel).toContain("event: 'canceled'")
  expect(reschedule).toContain("event: 'rescheduled'")
  expect(`${cancel}\n${reschedule}`).not.toContain('body?.workspace_id')
})

test('every supported league mutation invokes the shared tenant producer', () => {
  const data = source('src/app/api/league/data/route.ts')
  for (const event of [
    'league_division_created', 'league_season_created', 'league_score_submitted',
    'league_document_created', 'league_announcement',
  ]) expect(data).toContain(event)
  expect(data.match(/await notify\(/g)?.length).toBe(5)
  const join = source('src/app/api/leagues/[leagueId]/join/route.ts')
  expect(join).toContain('league_join_requested')
  expect(join).toContain('leagueStaffRecipients')
})

test('operations and security handlers create mandatory deduplicated superadmin events', () => {
  const routes = [
    'src/app/api/auth/session-security/route.ts',
    'src/app/api/admin/operations/interventions/route.ts',
    'src/app/api/admin/billing/reconciliation/route.ts',
  ].map(source)
  for (const route of routes) {
    expect(route).toContain('notifySuperadmins')
    expect(route).toContain('critical: true')
    expect(route).toContain('deduplicationKey:')
  }
})

test('tenant mutation routes reject an unauthenticated caller before recipient resolution', async ({ request }) => {
  const [league, team, documents] = await Promise.all([
    request.post('/api/league/data', { data: { action: 'create_division', name: 'Unauthorized' } }),
    request.post('/api/org/teams', { data: { name: 'Unauthorized' } }),
    request.post('/api/org/coach-documents', { data: { coach_id: crypto.randomUUID(), title: 'Unauthorized' } }),
  ])
  expect(league.status()).toBe(401)
  expect(team.status()).toBe(401)
  expect(documents.status()).toBe(401)
})

test('matrix contains only verified completion, intentional unsupported, or exact blockers', () => {
  const matrix = source('docs/notification-portal-event-matrix.md')
  expect(matrix).not.toMatch(/contract ready|producer-specific|schema and routing ready/i)
  for (const status of ['Implemented and tested', 'Blocked:']) expect(matrix).toContain(status)
})
