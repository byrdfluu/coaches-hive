# Coaches Hive cross-platform data parity

Last updated: 2026-10-08

## Verification standard

`Complete` requires a shared durable record, matching field semantics, authorization, refresh behavior, and a bidirectional persisted-backend test. Source-code similarity alone is not complete. The web application is currently restricted prelaunch. The linked Supabase project may contain real data, so destructive acceptance tests must run in an isolated staging project.

## Inventory and status

| Feature | Authoritative contract | iOS | Web | Sync and authorization | Status |
|---|---|---|---|---|---|
| Identity and sessions | Supabase Auth, `profiles` | Supabase session and profile | Supabase session and profile | Session refresh; profile/RLS policies | Partial: authenticated two-client fixture test pending |
| Roles, active persona, features, and capabilities | `workspace_memberships`, role permissions, shared portal capability document | `/api/mobile/capabilities` with workspace and acting role | `/api/capabilities` with the same resolver | No-store reload on workspace/persona selection; server authorization remains authoritative | Implemented locally: organization permissions are no longer inferred from payment access, organization coaches do not receive independent commerce controls, and league permission names match iOS; fixture tests pending |
| Onboarding answers and position | Auth metadata `onboarding_answers`, completion and last-step keys | Server-backed draft with UserDefaults cache | `/api/onboarding/profile` | Save on step changes; reload from auth metadata | Implemented locally; deployment/device test pending |
| Organization onboarding | Shared onboarding route | New shared flow | New shared flow; retired modal removed from org home | Server metadata | Implemented locally; deployment test pending |
| Organizations, memberships, teams | `organizations`, `organization_memberships`, `org_teams`, team membership tables | Direct Supabase/shared mobile APIs | Supabase/API routes | Workspace scoped RLS/API checks | Partial: action-by-action fixture tests pending |
| League structure and settings | League tables and membership RPCs | Direct Supabase | League APIs/pages for structure, venues, registration rules, competition format, and notification settings | League role policies | Implemented locally; remaining action and fixture tests pending |
| Athlete profiles and family selection | `athlete_profiles`, compatibility sub-profile records | Shared profile IDs | `resolveAuthorizedAthleteContext` | Ownership/family authorization | Partial: source reconciled, fixture tests pending |
| Contacts and roster | `profiles`, `org_contacts`, memberships | Supabase CRUD | Org APIs/pages | Organization membership policies | Partial: contract aligned, fixture tests pending |
| Coach discovery and saved coaches | Profiles, `athlete_saved_coaches` | Native discovery/save | Web discovery/save API | Athlete scoped | Partial: fixture tests pending |
| Saved organizations | `athlete_saved_organizations` | Native save/remove and saved organization list | Shared athlete API and organization list | Authorized athlete profile context and owner RLS | Implemented locally; migration/deployment/two-client fixture test pending |
| Organization programs and registration | `programs`, `program_registrations`, visibility RPCs | Assigned programs/register/pay | Assigned programs/register/pay | Athlete profile visibility | Partial: fixture and payment-plan tests pending |
| Saved organization programs | `athlete_saved_programs` | Native CRUD | `/api/athlete/saved-programs` and programs UI | Authorized athlete context plus visibility RPC | Implemented locally; migration/deployment/test pending |
| Training plans and progress | Training plan and progress tables | Native management/progress | Coach and athlete pages/APIs | Profile/workspace scoped | Partial: bidirectional fixture tests pending |
| Schedules, games, practices | Session, game, event, and availability tables | Native role views | Role pages/APIs | Workspace/profile selection | Partial: all event types not fixture-tested |
| Attendance and RSVPs | `session_attendance`, `athlete_schedule_rsvps` | Native mutations | Coach attendance and athlete team-event RSVP APIs/pages | Team invitation/profile scoped | Implemented locally; migration/deployment and cross-client fixture tests pending |
| Messaging and attachments | Shared thread/message APIs and storage paths | Mobile APIs | Same server services | API authorization, read receipts | Partial: reactions, all group paths, and media fixture tests pending |
| Support tickets and replies | `support_tickets`, canonical `support_messages` | Shared support APIs | Same support APIs | Bearer/cookie auth; requester/admin checks | Implemented locally; legacy backfill migration and fixture test pending |
| Announcements and notifications | Announcement tables, `notifications`, role preference tables | Native feed/preferences | Portal feed/preferences | Account/workspace scope | Partial: delivery and cross-client preference tests pending |
| Coach/org profile gallery | `profile_gallery_images`, `profile-gallery` storage paths | Native CRUD with filename/MIME/size metadata | Coach/org CRUD APIs and public canonical reads | Owner policies; public bucket | Implemented locally; migration/deployment/upload-render test pending |
| Athlete highlights/private video | `athlete_highlights`, `private-athlete-media` | Native upload/read/delete with metadata | Athlete CRUD API and profile management; coach/athlete profile reads | Private five-minute signed URLs; ownership and connected-coach policies | Implemented locally; migration/deployment/upload-render/denial tests pending |
| Organization documents | Document rows, `org-documents` | Native upload/review | Org/coach APIs | Private signed URLs | Partial: file replacement/deletion tests pending |
| League documents/signatures | League document/signature tables, `league-documents` | Native upload/sign | League pages | Private signed URLs | Partial: web/iOS upload-render test pending |
| Waivers and signed records | Org/coach waiver tables, immutable signing RPCs, private proof storage | Native sign/view | Web sign/download | Role/target policies | Partial: compatibility tables and media fixture tests pending |
| Compliance and proofs | `org_compliance_items`, assignment/profile data | Native CRUD | Org pages/APIs | Org policies | Partial: assigned-person field and proof rendering tests pending |
| Marketplace catalog | `products`, media storage | Native browse/manage | Web browse/manage | Seller/workspace policies | Partial: media metadata/cleanup audit pending |
| Marketplace cart | `profiles.cart` JSONB | Shared cart API | Shared cart API plus local cache | Account scoped; server-confirmed mutations; cache updates after server response | Implemented locally; reconnect and two-client fixture tests pending |
| Marketplace checkout/orders/refunds | Cart checkout, Stripe sessions/webhook, order/refund tables | Shared mobile/web APIs | Stripe routes/webhook | Server-only money and fulfillment | Partial: isolated Stripe multi-item fan-out test pending |
| Fees, dues, assignments | Integer-cent server contracts and fee tables | Native APIs | Org/athlete APIs | Workspace/profile checks | Partial: legacy decimal compatibility and fixture tests pending |
| Subscriptions and receipts | Stripe/Apple subscription and receipt tables | Native status/receipt APIs | Billing/admin APIs | Account/workspace checks | Partial: Apple production configuration and lifecycle tests pending |
| Facilities, bookings, fundraising | Mobile/shared API contracts and payment ledger | Native role views | Web routes/pages | Workspace authorization | Partial: cross-client fixture/payment tests pending |
| Organization tasks | `org_tasks` | Manager CRUD; assigned coaches complete/reopen | Shared API and Tasks page with the same assignment and status behavior | Active organization workspace; managers create/delete, assignees complete/reopen | Implemented locally; migration/deployment and two-client fixture test pending |
| Reviews, notes, saved reports and report alerts | Feature tables and API routes | Native role views | Portal pages/APIs | Role/workspace policies | Partial: saved report and alert feature parity remains unfinished |
| Push preferences and devices | `device_tokens`, push preference tables | Native token lifecycle/preferences | Web notification preferences | Per-device token plus account preferences | Partial: APNs delivery fixture pending |
| Audit/admin operations | Audit, operation, security tables | Native admin views | Superadmin portal | Admin role enforcement | Partial: all admin actions not fixture-tested |
| Content reports and user blocks | `content_reports`, `user_blocks`, moderation RPCs | Submit/block and admin moderation | Athlete, coach, and organization messaging can submit durable conversation reports; direct-message block/unblock uses the same `user_blocks` rows; inbox and send paths honor blocks from either client; paginated admin moderation queue | Authenticated participant validation, active-account and conversation-context RLS; support/ops/superadmin API gate | Implemented locally; staging submission and tenant-denial tests pending |

## Storage deployment snapshot

The linked project exposes the expected buckets, including private document/video buckets and public branding/gallery/catalog buckets. Several buckets still have no deployed MIME or size limit. Client-side checks alone do not satisfy the storage contract; bucket limits and RLS need a staging policy test before release.

## Local implementation completed in this audit

- Removed the retired organization onboarding modal and kept the shared resumable onboarding flow.
- Persisted native onboarding answers and last step to Supabase Auth metadata, with UserDefaults used as a retry cache.
- Consolidated native customer and admin support screens onto the canonical web support APIs and `support_messages`.
- Added a forward migration that backfills legacy support identity/messages and reproduces `athlete_saved_programs` with RLS.
- Added web saved-program read/write/delete support using the same athlete profile IDs and table as iOS.
- Added canonical native coach gallery rows to web public coach profiles.
- Added coach and organization gallery CRUD on web and aligned gallery metadata across both clients.
- Added canonical athlete-highlight CRUD on web, private signed URL rendering, durable media metadata, and cleanup after failed/deleted writes.
- Prevented failed cart reads from uploading stale browser cache and made add/update/remove/clear mutations wait for a successful server save.
- Added web league venue management and operations settings using the same registration, competition, and notification tables as iOS.
- Added web athlete team-event RSVP reads/writes using the same `athlete_schedule_rsvps` records and status values as iOS.
- Unified web and mobile feature capability documents, honored the mobile acting role, mapped organization features to their actual permission keys, restricted organization-covered coach commerce, and reconciled league settings and announcement permissions.
- Added the web content moderation queue over native `content_reports`, plus a forward schema/RLS/RPC reconciliation migration.
- Replaced web-only thread blocking for direct conversations with the shared `user_blocks` contract, made web inboxes reflect blocks created on iOS, and rejected web sends when either participant has blocked the other.
- Added web conversation-report controls for athlete, coach, and organization messaging, backed by the canonical `content_reports` queue and verified thread membership.
- Added web saved-organization reads and removal using the native `athlete_saved_organizations` contract.
- Added the organization Tasks workflow on web using the native `org_tasks` schema, assignment rules, statuses, and manager/assignee capabilities.
- Added reusable source/deployment audit scripts.

## Deployment state

| Component | State |
|---|---|
| Database migration | Local only; not applied to the linked live project |
| Storage policies/limits | Read-only inventory captured; staging verification pending |
| Edge Functions | Linked project inventory captured; locally referenced `paperwork-proof` is not present in the deployed list |
| Web/API | Local working tree only; restricted prelaunch deployment not updated by this audit |
| iOS | Local source builds for the simulator; no TestFlight/App Store release made |

## Genuine blockers

1. An isolated Supabase staging project with current schema, storage buckets, and Stripe test mode credentials is required for destructive create/edit/delete/upload/payment tests.
2. Two authorized test identities per applicable role/workspace are required to prove tenant isolation and bidirectional visibility.
3. Production deployment and App Store/TestFlight release authorization are required before production parity can be claimed.

## Manual acceptance checklist

Use two unrelated test workspaces and two users. For each major row above: create on iOS, verify on web, edit on web, verify on iOS, delete/archive on iOS, and verify web. Repeat in the opposite direction. Upload one valid photo, video, and document from each client and verify authorized rendering, fresh signed URLs for private files, replacement cleanup, deletion cleanup, and denial from the unrelated account. Finish with a multi-item Stripe test checkout and confirm one order per cart line, matching cents, receipts, webhook completion, and an empty synchronized cart.
