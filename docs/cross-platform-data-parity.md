# Coaches Hive cross-platform data parity

Last updated: 2026-10-11

## Verification standard

`Complete` requires a shared durable record, matching field semantics, authorization, refresh behavior, and a bidirectional persisted-backend test. Source-code similarity alone is not complete. The web application is currently restricted prelaunch. The linked Supabase project may contain real data, so destructive acceptance tests must run in an isolated staging project.

## Inventory and status

| Feature | Authoritative contract | iOS | Web | Sync and authorization | Status |
|---|---|---|---|---|---|
| Identity and sessions | Supabase Auth, `profiles` | Supabase session and profile | Supabase session and profile | Session refresh; profile/RLS policies | Partial: authenticated two-client fixture test pending |
| Roles, active persona, features, and capabilities | `workspace_memberships`, role permissions, shared portal capability document | `/api/mobile/capabilities` with workspace and acting role | `/api/capabilities` with the same resolver | No-store reload on workspace/persona selection; server authorization remains authoritative | Implemented locally: organization permissions are no longer inferred from payment access, organization coaches do not receive independent commerce controls, and league permission names match iOS; fixture tests pending |
| Onboarding answers and position | Auth metadata `onboarding_answers`, completion and last-step keys | Server-backed draft with UserDefaults cache | `/api/onboarding/profile` | Save on step changes; reload from auth metadata | Implemented locally; deployment/device test pending |
| Dashboard activation checklist | `dashboard_layouts.hidden_sections` using shared page keys and `activation` | Reads/upserts the same rows for athlete, coach, organization, and league dashboards; UserDefaults is fallback cache | Athlete, coach, and organization dashboards read/upsert through `/api/dashboard-layout` | Account-owned RLS; refresh on dashboard load, foreground, and workspace switch | Implemented locally; authenticated two-client test pending |
| Organization onboarding | Shared onboarding route | New shared flow | New shared flow; retired modal removed from org home | Server metadata | Implemented locally; deployment test pending |
| Organizations, memberships, teams | `organizations`, `organization_memberships`, `org_teams`, team membership tables | Direct Supabase/shared mobile APIs | Supabase/API routes | Workspace scoped RLS/API checks | Partial: action-by-action fixture tests pending |
| League structure and settings | League tables and membership RPCs | Direct Supabase | League APIs/pages for structure, venues, registration rules, competition format, and notification settings | League role policies | Implemented locally; remaining action and fixture tests pending |
| Athlete profiles and family selection | `athlete_profiles` plus Supabase Auth `selected_athlete_profile_id` metadata | Native selection restores from and writes the shared Auth metadata | `AthleteProfileContext` restores through `/api/roles/available` and writes through `/api/workspaces/active` | Ownership/family authorization; browser storage is cache only | Implemented locally; authenticated two-device fixture test pending |
| Contacts and roster | `profiles`, `org_contacts`, memberships | Supabase CRUD | Org APIs/pages | Organization membership policies | Partial: contract aligned, fixture tests pending |
| Coach discovery and saved coaches | Profiles, `athlete_saved_coaches` | Native discovery/save | Web discovery/save API | Athlete scoped | Partial: fixture tests pending |
| Coach saved athletes | `coach_saved_athletes`, `athlete_profiles` | Native save/remove and a saved-athlete roster section | Coach saved-athlete API, profile save/remove control, and roster hydration from the same rows | Coach-owned RLS and authenticated coach API | Implemented locally; migration deployment and two-client fixture test pending |
| Saved organizations | `athlete_saved_organizations` | Native save/remove and saved organization list | Shared athlete API and organization list | Authorized athlete profile context and owner RLS | Implemented locally; migration/deployment/two-client fixture test pending |
| Organization programs and registration | `programs`, `program_registrations`, `family_payment_plan_enrollments`, `family_payment_plan_installments`, visibility and enrollment RPCs | Assigned programs, full payment, or installment enrollment | Assigned programs, full payment, or installment enrollment through the same RPC and checkout contract | Authorized athlete profile context and server payment authorization | Implemented in code: payment-plan fields, enrollment, first-installment checkout, and idempotency now match iOS. Stripe staging and two-client fixture tests remain pending. |
| Offering coach eligibility and rosters | Workspace/organization memberships, offering assignment tables, assignment and roster RPCs | Native organization assignment controls and coach rosters | Organization assignment pages and coach workspace use the same RPCs | Only active Coach, Assistant Coach, or Head Coach memberships; manager authorization remains server-side | Implemented locally with legacy-membership compatibility; migration deployment and authenticated two-client test pending |
| Saved organization programs | `athlete_saved_programs` | Native CRUD | `/api/athlete/saved-programs` and programs UI | Authorized athlete context plus visibility RPC | Implemented locally; migration/deployment/test pending |
| Training plans and progress | Training plan and progress tables | Native management/progress | Coach and athlete pages/APIs | Profile/workspace scoped | Partial: bidirectional fixture tests pending |
| Schedules, games, practices | Session, game, event, and availability tables | Native role views | Role pages/APIs | Workspace/profile selection | Partial: all event types not fixture-tested |
| Attendance and RSVPs | `session_attendance`, `athlete_schedule_rsvps` | Native mutations | Coach attendance and athlete team-event RSVP APIs/pages | Team invitation/profile scoped | Implemented locally; migration/deployment and cross-client fixture tests pending |
| Messaging, reactions, and attachments | Shared `threads`, `messages`, `message_reactions`, `message_attachments`, mobile thread APIs, and durable paths in private `private-athlete-media` storage | Native send/read/edit/delete/react plus image/video/PDF upload and five-minute signed reads for athlete, coach, and organization portals | Web send/read/edit/delete/react plus the same image/video/PDF types, durable paths, fresh five-minute signed reads, and failed-write cleanup | Thread participation, scoped administrators, sender-only edits, participant-scoped reactions, soft deletes, read receipts, participant-scoped storage reads | Implemented locally and covered by source contract tests; migration deployment plus authenticated image/video/PDF and unrelated-user denial fixtures pending |
| Support tickets and replies | `support_tickets`, canonical `support_messages` | Shared support APIs | Same support APIs | Bearer/cookie auth; requester/admin checks | Implemented locally; legacy backfill migration and fixture test pending |
| Announcements and notifications | Announcement tables, `notifications`, role preference tables | Native feed/preferences | Portal feed/preferences | Account/workspace scope | Partial: delivery and cross-client preference tests pending |
| Coach/org profile gallery | `profile_gallery_images`, `profile-gallery` storage paths | Native CRUD with filename/MIME/size metadata | Coach/org CRUD APIs and public canonical reads | Owner policies; public bucket | Implemented locally; migration/deployment/upload-render test pending |
| Athlete highlights/private video | `athlete_highlights`, `private-athlete-media` | Native upload/read/delete with metadata | Athlete CRUD API and profile management; coach/athlete profile reads | Private five-minute signed URLs; ownership and connected-coach policies | Implemented locally; migration/deployment/upload-render/denial tests pending |
| Organization documents | Document rows, `org-documents` | Native upload/review | Org/coach APIs | Private signed URLs | Partial: file replacement/deletion tests pending |
| League documents/signatures | League document/signature tables, `league-documents` | Native upload/sign | League pages | Private signed URLs | Partial: web/iOS upload-render test pending |
| Waivers and signed records | Org/coach waiver tables, immutable signing RPCs, private proof storage | Native sign/view | Web sign/download | Role/target policies | Partial: compatibility tables and media fixture tests pending |
| Compliance and proofs | `org_compliance_items`, `org_compliance_uploads`, private `attachments` objects, organization members | Native full item CRUD with assignee plus authenticated upload/list/open/delete | Web full item CRUD plus private upload/list/download/delete | Active organization workspace authority; assignees must be active members; fresh signed URLs; PDF/JPG/PNG/WebP and 10 MB limit; failed record writes clean uploaded objects | Implemented in both clients against the same records and object paths. Live bidirectional and unrelated-tenant denial tests remain pending in staging. |
| Marketplace catalog | `products`, `marketplace_items`, private `product-media` | Native browse/manage with durable paths, fresh signed URLs, metadata, failed-write and replacement cleanup | Web browse/manage with durable paths, metadata, failed-write and replacement cleanup | Authenticated published-item reads; seller/workspace writes; 20 MB MIME allowlist | Implemented locally; deployed migration and cross-client upload/render/delete fixture tests pending |
| Marketplace cart | `profiles.cart` JSONB | Shared cart API | Shared cart API plus local cache | Account scoped; server-confirmed mutations; cache updates after server response | Implemented locally; reconnect and two-client fixture tests pending |
| Marketplace checkout/orders/refunds | Cart checkout, Stripe sessions/webhook, order/refund tables | Shared mobile/web APIs | Stripe routes/webhook | Server-only money and fulfillment | Partial: isolated Stripe multi-item fan-out test pending |
| Fees, dues, assignments | Integer-cent server contracts and fee tables | Native APIs | Org/athlete APIs | Workspace/profile checks | Partial: legacy decimal compatibility and fixture tests pending |
| Subscriptions and receipts | Stripe/Apple subscription and receipt tables plus `admin_subscription_access_overrides` | Native status/receipt APIs consume the shared server snapshot; no account-specific access list remains in the app | Billing/admin APIs use the same active override rows | Account/workspace checks; active override dates resolved server-side | Implemented locally for shared access decisions; Apple production configuration and lifecycle tests pending |
| Recurring organization fee recovery | `organization_recurring_fees`, invoices, checkout attempts, Stripe status API | Discovers the latest resumable server record by athlete before consulting its legacy device cache, then loads authoritative status | Shared storefront and recurring-fee APIs | Payer-owned RLS plus organization billing administrators | Implemented locally; cross-device checkout-resume fixture pending |
| Facilities, bookings, fundraising | Mobile/shared API contracts and payment ledger | Native role views | Web routes/pages | Workspace authorization | Partial: cross-client fixture/payment tests pending |
| Organization tasks | `org_tasks` | Manager CRUD; assigned coaches complete/reopen | Shared API and Tasks page with the same assignment and status behavior | Active organization workspace; managers create/delete, assignees complete/reopen | Implemented locally; migration/deployment and two-client fixture test pending |
| Reviews, notes, saved reports and report alerts | `org_saved_reports`, `org_report_alerts`, and organization report APIs | Native organization report save, schedule, and alert actions | Organization report saved-view and alert management backed by the same records | Active organization resolved server-side; writes scoped to permitted organization roles | Implemented in code: web and iOS now share saved reports, alert lifecycle, and linked scheduled-report records. Authenticated two-client staging verification remains pending. |
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
- Reconciled message attachments onto one private bucket and durable path contract, stopped persisting signed URLs, added fresh read-time URLs to every web/mobile reader, cleaned failed sends, and added native PDF send/open support for athlete, coach, and organization messaging.
- Added web read/add/remove support for native `coach_saved_athletes` rows and hydrated saved athletes into the coach roster.
- Moved native dashboard activation-checklist dismissal onto the same `dashboard_layouts` records used by web while retaining UserDefaults only as an offline cache.
- Made native recurring-fee recovery discover the newest resumable Supabase record so checkout and billing state survives device changes and reinstall.
- Removed account-specific native demo fixtures, fake report totals, forced roster labels, fake booking payment state, persona overrides, and Stripe-readiness bypasses so iOS renders only shared backend records.
- Moved complimentary subscription access into the shared `admin_subscription_access_overrides` resolution used by the mobile and web billing snapshot instead of hardcoded iOS email addresses.
- Reconciled web offering coach discovery with multi-role workspace memberships while retaining legacy organization membership compatibility, active-profile filtering, and server-authorized assignment RPCs.
- Made every native messaging portal replace legacy role-specific projections with the authoritative mobile inbox, preserving organization conversation identity across athlete, coach, and organization views.
- Cleared account-scoped native state when the authenticated identity changes, recomputed onboarding after workspace switches, and made organization invite cancellation retry without a stale acting-role assertion while retaining workspace authorization.
- Persisted the active family athlete selection from iOS into the same Supabase Auth metadata used by web and restored it when a session loads, so profile context survives switching devices.
- Unified native program, training package, training session, schedule, and tryout coach selectors on the same server-authorized assignable-coach RPC used by web.
- Added reusable source/deployment audit scripts.

## Deployment state

| Component | State |
|---|---|
| Database migration | Linked history verified on 2026-10-11. The remote history ends at `20261010140000`; later parity migrations `20261010150000` through `20261011040000` are local only. Many older repository migrations are also absent from remote history, so a blanket migration push is unsafe without a staging baseline. |
| Storage policies/limits | Read-only inventory captured on 2026-10-11. The deployed `private-athlete-media` bucket is private and capped at 200 MB but currently allows only JPEG and video MIME types; the local attachment migration adds PNG, WebP, HEIC, and PDF. Staging policy verification remains pending. |
| Edge Functions | Linked project inventory captured; locally referenced `paperwork-proof` is not present in the deployed list |
| Web/API | Local working tree only; restricted prelaunch deployment not updated by this audit |
| iOS | Full local simulator build passed on 2026-10-11 after family athlete selection persistence and unified offering coach eligibility; no TestFlight/App Store release made |

## Genuine blockers

1. An isolated Supabase staging project with current schema, storage buckets, and Stripe test mode credentials is required for destructive create/edit/delete/upload/payment tests.
2. Two authorized test identities per applicable role/workspace are required to prove tenant isolation and bidirectional visibility.
3. Production deployment and App Store/TestFlight release authorization are required before production parity can be claimed.

## Manual acceptance checklist

Use two unrelated test workspaces and two users. For each major row above: create on iOS, verify on web, edit on web, verify on iOS, delete/archive on iOS, and verify web. Repeat in the opposite direction. Upload one valid photo, video, and document from each client and verify authorized rendering, fresh signed URLs for private files, replacement cleanup, deletion cleanup, and denial from the unrelated account. Finish with a multi-item Stripe test checkout and confirm one order per cart line, matching cents, receipts, webhook completion, and an empty synchronized cart.
