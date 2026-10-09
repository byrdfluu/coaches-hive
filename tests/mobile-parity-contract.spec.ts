import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('mobile parity backend contracts', () => {
  test('booking cancellation and rescheduling are authenticated and authoritative', () => {
    const cancel = source('src/app/api/mobile/bookings/[id]/cancel/route.ts')
    const reschedule = source('src/app/api/mobile/bookings/[id]/reschedule/route.ts')
    const response = source('src/lib/mobileBookingActions.ts')
    for (const route of [cancel, reschedule]) {
      expect(route).toContain('getMobileRequestUser')
      expect(route).toContain('bookingResponse')
      expect(route).toContain('paymentStatus')
      expect(route).toContain('refundStatus')
    }
    expect(response).toContain('released_capacity')
    expect(cancel).not.toContain('stripe.refunds.create')
    const migration = source('supabase/migrations/20260731000000_mobile_parity_backend.sql')
    expect(migration).toContain('cancel_athlete_booking')
    expect(migration).toContain('reschedule_athlete_booking')
  })

  test('support threads accept mobile bearer auth and track unread state', () => {
    const tickets = source('src/app/api/support/tickets/route.ts')
    const messages = source('src/app/api/support/messages/route.ts')
    expect(tickets).toContain('getMobileRequestUser')
    expect(messages).toContain('getMobileRequestUser')
    expect(messages).toContain('increment_support_unread')
    expect(messages).toContain('customer_read_at')
    expect(tickets).toContain("from('support_messages')")
    expect(messages).toContain("from('support_messages')")
    const adminTickets = source('src/app/api/admin/support/tickets/route.ts')
    const adminMessages = source('src/app/api/admin/support/messages/route.ts')
    expect(adminTickets).toContain('getMobileRequestUser')
    expect(adminMessages).toContain('getMobileRequestUser')
    const reconciliation = source('supabase/migrations/20261008224000_cross_platform_support_and_saved_entities.sql')
    expect(reconciliation).toContain('legacy_support_ticket_message_id')
    expect(reconciliation).toContain('requester_email = coalesce')
  })

  test('saved organization programs use the same athlete-scoped table as iOS', () => {
    const route = source('src/app/api/athlete/saved-programs/route.ts')
    expect(route).toContain("from('athlete_saved_programs')")
    expect(route).toContain('resolveAuthorizedAthleteContext')
    expect(route).toContain("rpc('is_org_program_visible'")
    expect(route).toContain(".eq('athlete_id', athlete.profileId)")
  })

  test('saved organizations use the native athlete-scoped contract', () => {
    const route = source('src/app/api/athlete/saved-organizations/route.ts')
    const page = source('src/app/athlete/orgs-teams/page.tsx')
    const migration = source('supabase/migrations/20261008232000_athlete_saved_organizations_parity.sql')
    expect(route).toContain("from('athlete_saved_organizations')")
    expect(route).toContain('resolveAuthorizedAthleteContext')
    expect(route).toContain("onConflict: 'athlete_id,org_id'")
    expect(page).toContain("fetch(`/api/athlete/saved-organizations")
    expect(migration).toContain('owns_athlete_profile')
  })

  test('content reports have a shared moderated queue and guarded schema', () => {
    const route = source('src/app/api/admin/moderation/route.ts')
    const page = source('src/app/admin/moderation/page.tsx')
    const migration = source('supabase/migrations/20261008231000_content_moderation_parity.sql')
    expect(route).toContain("from('content_reports')")
    expect(route).toContain("['superadmin', 'ops', 'support']")
    expect(route).toContain('pageSize = 25')
    expect(page).toContain("fetch('/api/admin/moderation'")
    expect(migration).toContain('report_conversation')
    expect(migration).toContain('admin_review_content_report')
    expect(migration).toContain('content_reports_submission_context')
  })

  test('coach public profiles expose native profile gallery rows', () => {
    const route = source('src/app/api/public/coaches/route.ts')
    const profile = source('src/components/CoachPublicProfileView.tsx')
    expect(route).toContain("from('profile_gallery_images')")
    expect(route).toContain(".eq('owner_type', 'coach')")
    expect(route).toContain('gallery_images: galleryByCoach.get(profile.id)')
    expect(profile).toContain('coach?.gallery_images')
    const gallery = source('src/app/api/coach/gallery/route.ts')
    expect(gallery).toContain("from('profile_gallery_images')")
    expect(gallery).toContain("from('profile-gallery')")
    expect(gallery).toContain('original_filename')
    expect(gallery).toContain('size_bytes')
    expect(gallery).toContain("remove([storagePath])")
    const orgGallery = source('src/app/api/org/gallery/route.ts')
    expect(orgGallery).toContain("from('profile_gallery_images')")
    expect(orgGallery).toContain("from('profile-gallery')")
    expect(orgGallery).toContain('resolveActiveOrganizationForUser')
  })

  test('athlete highlights use canonical private storage records on both clients', () => {
    const route = source('src/app/api/athlete/highlights/route.ts')
    const resolver = source('src/lib/athleteProfileResolver.ts')
    const migration = source('supabase/migrations/20261008225000_athlete_highlight_file_contract.sql')
    expect(route).toContain("from('athlete_highlights')")
    expect(route).toContain("from('private-athlete-media')")
    expect(route).toContain('createSignedUrl')
    expect(route).toContain('duration_seconds')
    expect(route).toContain('remove([path])')
    expect(resolver).toContain("from('athlete_highlights')")
    expect(migration).toContain('mime_type')
    expect(migration).toContain('size_bytes')
    expect(migration).toContain('athlete_highlights_authorized_read')
  })

  test('marketplace cart mutations wait for the authoritative server response', () => {
    const listing = source('src/app/athlete/marketplace/page.tsx')
    const detail = source('src/app/athlete/marketplace/product/[id]/page.tsx')
    const cart = source('src/app/athlete/marketplace/cart/page.tsx')
    for (const page of [listing, detail, cart]) {
      expect(page).toContain("fetch('/api/athlete/cart'")
      expect(page).toContain('Array.isArray(payload?.cart)')
      expect(page).toContain('setCartItems(payload.cart)')
    }
    expect(cart).toContain('const saveCart = async')
  })

  test('web and mobile capabilities use one role-aware resolver', () => {
    const web = source('src/app/api/capabilities/route.ts')
    const mobile = source('src/app/api/mobile/capabilities/route.ts')
    const resolver = source('src/lib/portalCapabilities.ts')
    expect(web).toContain('resolvePortalCapabilities')
    expect(mobile).toContain('resolvePortalCapabilities')
    expect(mobile).toContain("request.headers.get('x-acting-role')")
    expect(resolver).toContain('activeWorkspaceRole')
    expect(resolver).toContain("permission('manage_members')")
    expect(resolver).toContain("permission('manage_payments')")
    expect(resolver).toContain('organizationCoachDocument')
    expect(resolver).not.toContain("const manage=workspaceCan(workspace,'manage_payments')")
  })

  test('league settings and venues share the native league tables', () => {
    const settings = source('src/app/api/league/settings/route.ts')
    const data = source('src/app/api/league/data/route.ts')
    for (const table of ['league_registration_rules', 'league_notification_preferences', 'league_competition_settings']) {
      expect(settings).toContain(`from('${table}')`)
    }
    expect(settings).toContain("upsert(rules, { onConflict: 'league_id' })")
    expect(settings).toContain("upsert(notifications, { onConflict: 'league_id' })")
    expect(settings).toContain("upsert(competition, { onConflict: 'league_id' })")
    expect(data).toContain("venues:'league_venues'")
    expect(data).toContain("action==='save_venue'")
    expect(settings).toContain("leagueCan(authority, 'manage_registrations')")
    expect(data).toContain("leagueCan(authority, 'send_announcements')")
  })

  test('athlete team-event RSVPs use the native schedule response contract', () => {
    const route = source('src/app/api/athlete/schedule-rsvps/route.ts')
    const calendar = source('src/app/athlete/calendar/page.tsx')
    const migration = source('supabase/migrations/20261008230000_athlete_schedule_rsvp_contract.sql')
    expect(route).toContain("from('athlete_schedule_rsvps')")
    expect(route).toContain("event_source: 'practice_plan'")
    expect(route).toContain("onConflict: 'event_source,event_id,athlete_id'")
    expect(route).toContain('resolveAuthorizedAthleteContext')
    expect(calendar).toContain("fetch('/api/athlete/schedule-rsvps'")
    expect(migration).toContain('practice_plan_invitations')
    expect(migration).toContain('athlete_schedule_rsvps_write')
  })

  test('organization tasks share the native task contract and role rules', () => {
    const route = source('src/app/api/org/tasks/route.ts')
    const page = source('src/app/org/tasks/page.tsx')
    const migration = source('supabase/migrations/20261008233000_org_tasks_parity.sql')
    expect(route).toContain("from('org_tasks')")
    expect(route).toContain("eq('assigned_to', session.user.id)")
    expect(route).toContain('Assignee must be an active organization member')
    expect(page).toContain("fetch('/api/org/tasks'")
    expect(page).toContain('completed:task.status')
    expect(migration).toContain('Assignees may only complete or reopen their tasks')
    expect(migration).toContain('org_tasks_delete')
  })

  test('marketplace cancellation creates a reviewable refund request', () => {
    const route = source('src/app/api/mobile/marketplace/orders/[id]/cancel/route.ts')
    const migration = source('supabase/migrations/20260731000000_mobile_parity_backend.sql')
    expect(route).toContain('payment_refund_requests')
    expect(route).not.toContain('stripe.refunds.create')
    expect(route).toContain("cancellation_status: 'requested'")
    expect(migration).toContain('drop function if exists public.cancel_marketplace_order(uuid, text)')
    expect(migration).toContain('cancel_marketplace_order')
  })

  test('mobile receipts expose Stripe URLs and Apple transaction records', () => {
    const route = source('src/app/api/mobile/receipts/route.ts')
    expect(route).toContain('receipt_url')
    expect(route).toContain('apple_iap_subscriptions')
    expect(route).toContain('downloadable_record')
  })

  test('superadmin cross-account subscription endpoint remains available', () => {
    const route = source('src/app/api/admin/subscriptions/route.ts')
    expect(route).toContain('isSuperadmin')
    expect(route).toContain("from('platform_subscriptions')")
    expect(route).toContain('user_id')
  })
})
