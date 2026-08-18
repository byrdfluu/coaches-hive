# Web and iOS portal parity audit

Audited on 2026-08-18 against the Next.js repository and `/Users/juwan/Desktop/CH App/CH App`. “Shared” means both clients use the same Supabase table or Next.js API. Platform-specific layout is not a mismatch.

## Result

The local reconciliation adds the web surfaces that were genuinely absent: per-athlete attendance, coach-to-athlete training plans and athlete progress, standalone organization contacts, internal organization compliance items, and role-specific notification preferences. Migration `20260818030000_portal_parity_reconciliation.sql` makes their shared tables authoritative in the web migration history.

This is locally implemented, not deployed. Production parity must not be claimed until the additive migration is applied to staging and authenticated smoke tests pass for all three roles.

## Capability and data matrix

| Area | Organization | Coach | Athlete/family | Canonical contract | Status |
|---|---|---|---|---|---|
| Auth, role routing, onboarding | Identity and workspace | Identity and sport | Identity, DOB, guardian | Supabase Auth, memberships, shared onboarding API | Shared |
| Dashboard and profile | Org health and settings | Sessions, roster, earnings | Schedule, payments, documents | Existing role APIs/views | Shared |
| Teams and roster | Full management | Affiliations and linked athletes | Affiliations and family workspace | `organizations`, `organization_memberships`, `org_teams`, `org_team_*`, `coach_athlete_links`, `athlete_profiles` | Shared |
| Contacts | Member and standalone directory | Linked athletes | Guardian/emergency contacts | `profiles`, `org_contacts`, `emergency_contacts` | Reconciled |
| Calendar and bookings | Cross-team schedule | Availability, bookings, sessions | Schedule and booking | Sessions and booking APIs | Shared |
| Attendance | Reporting | Mark per athlete | Attendance history | `session_attendance` | Reconciled; web `/coach/attendance` |
| Training plans | Not a primary org flow | Create/manage | View/update progress | `coach_training_plans`, `coach_training_plan_progress` | Reconciled; web `/coach/plans`, `/athlete/plans` |
| Messaging, announcements, notes | Manage | Direct/team | Direct/team | Shared server services and thread/note tables | Shared |
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
| Equipment, travel, insurance checkout | Documentation only | Documentation only | Documentation only | None until launch | Intentionally not launched |

## Compatibility boundaries

- Older iOS readers still use decimal-dollar fields for some fees, registrations, and marketplace history. New payment-core APIs and the unified ledger use integer cents. Native readers still need refactoring before the money model is uniform end to end.
- `org_enrollments` is a legacy roster-enrollment record while browser enrollment forms/submissions are the newer intake workflow. Both remain additive.
- Coach waivers have compatibility tables plus newer unified waiver records. Existing records remain readable; new work should use the shared server service.
- Reminder rows live in Supabase while Postmark delivery is a server worker responsibility. This is intentional.
- Stripe account type, fees, payout schedules, idempotency, and ledger writes remain server-authoritative.

## Release acceptance gate

1. Apply the additive migration to staging only.
2. Sign in as an organization admin, coach, and athlete on web and iOS with the same accounts.
3. Create/edit attendance, plans/progress, directory contacts, compliance items, and preferences on one platform and verify the other reflects each record.
4. Exercise registration, dues, event, facility, fundraising, marketplace, and booking payments; confirm identical integer-cent values and statuses in `payment_transactions`.
5. Confirm RLS denial for cross-workspace reads/writes.
6. Run browser and native regression suites before production.
