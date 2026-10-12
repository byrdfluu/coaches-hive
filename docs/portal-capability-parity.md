# Web and iOS portal parity audit

Audited on 2026-08-18 against the Next.js repository and `/Users/juwan/Desktop/CH App/CH App`. “Shared” means both clients use the same Supabase table or Next.js API. Platform-specific layout is not a mismatch.

## Result

Full web/iOS parity is **not yet verified and must not be reported as complete**. Earlier entries marked “Shared” established that similarly named surfaces or tables existed; they did not prove field-level data equivalence, action equivalence, cross-workspace isolation, or bidirectional authenticated behavior.

The reconciliation compares the actual Swift queries and selected-persona behavior with the web implementation. Workspace authority, profile switching, organization overview metrics, athlete-profile-scoped APIs, and later capability gaps are corrected in source. Completion evidence uses source contracts, local builds, automated tests, and read-only checks against the currently authorized backend without requiring a separate staging project or dedicated test identities.

## Capability and data matrix

| Area | Organization | Coach | Athlete/family | Canonical contract | Status |
|---|---|---|---|---|---|
| Auth, role routing, onboarding | Identity and workspace | Identity and sport | Identity, DOB, guardian | Supabase Auth, memberships, shared onboarding API | Shared |
| Dashboard and profile | Org health and settings | Selected-workspace sessions, roster, balances, documents, and reports | Schedule, payments, documents | Existing role APIs/views | Shared |
| Teams and roster | Full management | Affiliations and linked athletes | Affiliations and family workspace | `organizations`, `organization_memberships`, `org_teams`, `org_team_*`, `coach_athlete_links`, `athlete_profiles` | Shared |
| Contacts | Member and standalone directory | Linked athletes | Guardian/emergency contacts | `profiles`, `org_contacts`, `emergency_contacts` | Reconciled |
| Calendar and bookings | Cross-team schedule | Availability, bookings, sessions | Schedule and booking | Sessions and booking APIs | Shared |
| Attendance | Reporting | Mark per athlete | Attendance history | `session_attendance` | Reconciled; web `/coach/attendance` |
| Training plans | Not a primary org flow | Create/manage | View/update progress | `coach_training_plans`, `coach_training_plan_progress` | Reconciled; web `/coach/plans`, `/athlete/plans` |
| Messaging, announcements, notes | Manage | Direct/team; athlete notes use permanent profile IDs and selected workspace | Direct/team | Shared server services and thread/note tables | Shared |
| Waivers and compliance | Create, target, tasks, documents | Assign/track | Complete/view proof | Waiver tables, `org_compliance_items`, uploads | Reconciled |
| Tryouts, programs, enrollment | Manage/report | Own programs | Discover/register/pay | Program, tryout, enrollment APIs | Shared |
| Memberships | Billing context | Create/manage | Buy/manage | Membership APIs and Stripe fulfillment | Shared |
| Marketplace and refunds | Sell/fulfill/refund | Sell/fulfill/refund | Buy/request refund | Marketplace APIs and refund requests | Shared |
| Registration collections | Create/share/monitor | Assigned visibility | Register, waiver, checkout | Mobile registration API and shared browser service | Shared |
| Recurring dues | Schedule/retry/remind/waive | Collection visibility | Autopay/installments | Org/mobile dues APIs | Shared |
| Payment events | Create/split/monitor | Team visibility | Partial pay | Org/mobile payment-event APIs | Shared |
| Facilities | List/book/refund | Book/manage | Book/cancel | Facility APIs | Shared |
| Fundraising | Create/monitor | Campaign visibility | Contribute | Fundraising APIs | Shared |
| Payment center | Org ledger | Coach dashboard | Family payments/receipts | Mobile dashboard, `payment_transactions`, integer cents | Shared server contract |
| Notifications | Feed/preferences | Feed/preferences | Feed/preferences | Role preference tables and notifications API | Reconciled |
| Reports, exports, audit | Reports/schedules/exports | Reports | Activity/receipts | Existing report/export/audit services | Shared core |
| Support | Tickets/replies | Tickets/replies | Tickets/replies | Support APIs and `support_ticket_messages` | Shared |
| Equipment and travel collections | Create and monitor | Assigned-team visibility | View and pay assigned obligations | `payment_collection_obligations`, mobile collection APIs, Stripe webhook ledger | Shared server contract |
| Insurance checkout | Documentation only | Documentation only | Documentation only | None until launch | Intentionally not launched |

## Compatibility boundaries

- Older iOS readers still use decimal-dollar fields for some fees, registrations, and marketplace history. New payment-core APIs and the unified ledger use integer cents. Native readers still need refactoring before the money model is uniform end to end.
- `org_enrollments` remains the roster/season enrollment record used by iOS and is exposed to web through `/api/org/roster-status`; web enrollment forms/submissions remain the intake workflow and no longer hide native roster status from web.
- Coach waivers have compatibility tables plus newer unified waiver records. Existing records remain readable; new work should use the shared server service.
- Reminder rows live in Supabase while Postmark delivery is a server worker responsibility. This is intentional.
- Stripe account type, fees, payout schedules, idempotency, and ledger writes remain server-authoritative.

## Release acceptance gate

1. Review and apply the generated forward migration bundle to the authorized production project.
2. Deploy required Edge Functions and the web/API revision.
3. Run the source, database, browser, native, authorization, and build gates recorded in the cross-platform parity report.
4. Exercise registration, dues, event, facility, fundraising, marketplace, and booking payment contracts without modifying real customer records.
5. Confirm tenant isolation from deployed RLS and authorization definitions plus safe read-only backend checks.
6. Release the verified iOS build through TestFlight/App Store after the backend and web revisions are deployed.

## 2026-09-13 local verification

- The complete web suite passes all locally executable contracts: 251 passed on the final full run before the current-plan price-mapping correction; that correction then passed its focused 8-test suite.
- TypeScript, the 385-route API security audit, whitespace validation, and the production Next.js build pass.
- The remaining 11 gated cases require non-empty authenticated athlete test credentials and isolated Stripe test-mode lifecycle fixtures. Placeholder environment variables are present locally but have empty values, so no authenticated cross-platform or real Stripe result is claimed.
- Production deployment and an iOS-to-web bidirectional smoke run remain release actions, not local implementation results.

## 2026-09-13 source-level reconciliation

| Scope | Current evidence | Status |
|---|---|---|
| Workspace/profile switcher | Uses the same workspace, league, coach-team, and accessible-athlete RPCs as iOS; exact selections are persisted server-side. | Implemented locally; authenticated device-to-web verification pending |
| Organization overview | Uses `org_settings`, `org_teams`, memberships, active athlete memberships, upcoming sessions, and `org_fee_assignments`, matching the native dashboard sources. | Implemented locally |
| Athlete identity/profile | One server resolver validates ownership or an active family relationship before returning an athlete persona. | Implemented locally |
| Athlete sessions, dues, payments, waivers, notes, metrics, teams, games | Requests now carry the selected athlete profile and query its canonical profile ID while retaining owner-user compatibility where the legacy schema requires it. | Implemented locally; production data verification pending |
| Athlete programs | Web loads assigned organization programs through the same `assigned_org_programs_for_athlete` visibility RPC, scopes registrations to the selected athlete, supports shared saved-program toggling, and offers both full payment and `enroll_program_payment_plan` installment enrollment with the same first-installment checkout used by iOS. Purchased coach training programs remain a separate section. | Implemented locally; authenticated Stripe staging verification pending |
| Athlete purchases | Account-level receipts exist and newer orders carry `athlete_profile_id`; legacy purchases without profile attribution cannot always be assigned to a dependent athlete. | Partial; migration/backfill policy needed |
| Athlete notifications | Native and web are account-level. UI context must not imply that account notifications are exclusive to one selected dependent. | Shared account scope; UX review pending |
| Coach portal | Active organization/team resolution is server-authoritative for sessions, games, dashboard counts, roster/profile access, balances, training plans, document requests, direct-message athlete recipients, structured program/exercise authoring, and owned marketplace-product linking. Roster/payment names and photos come from exact canonical athlete profiles; organization rosters derive from assigned team membership. | Implemented locally; deployment verification remains |
| Organization portal | Overview and primary workspace selection are reconciled. Every management action and report still requires native-query/action comparison and authenticated verification. | Partial |
| League and Superadmin portals | League organization, team, division, season, schedule, registration, fee, document, venue, settings, announcement, and final-score actions now use shared contracts. The full Superadmin action/data comparison is still being reconciled. | League implemented locally; Superadmin audit in progress |
| Cross-platform acceptance | Source contracts, local builds, automated parity tests, and read-only checks against the currently authorized backend provide the completion evidence. Production deployment and iOS release status are reported separately and never inferred from local code. | In progress; no staging project or dedicated test identities required |
