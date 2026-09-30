# Notification portal-event matrix

All new producers use `insertNotifications`, include tenant context in `data`, and provide a stable `deduplication_key` when the source has an event/request identifier. Critical security, account, failed-payment, chargeback, and webhook-failure alerts cannot be disabled.

| Event family | Source of truth | Recipient portals | Authorization | Category | Destination | Preference | Dedupe key | Status |
|---|---|---|---|---|---|---|---|---|
| Invitations and invitation decisions | invitation records/routes | Parent/Athlete, Coach, Org Admin | invite recipient or current tenant staff | `invites` | invitation/workspace screen | Yes | invitation ID + state | Existing producer; normalized by shared service |
| Bookings, cancellations, schedule changes | bookings/sessions | Parent/Athlete, Independent Coach, Org Coach | booking participant/current assignment | `schedule` | schedule or booking | Yes | booking ID + state | Existing booking/reminder producers; normalized |
| Messages, mentions, announcements | messages/threads | All tenant portals | current thread participant | `messages` | tenant thread | Yes | message ID + recipient | Existing producers; normalized |
| Payments, failures, payouts, refunds | Stripe webhook/payment records | Parent/Athlete, Coach, Org Admin, League Admin | payer, seller, or authorized finance staff | `payments` | payment/receipt/payout screen | Failures mandatory; routine events optional | Stripe event ID + record ID | Existing payment/refund/payout producers; normalized |
| Waivers and documents | waiver/document assignments | Parent/Athlete, Coach, Org Admin, League Admin | assignee or authorized staff | `documents` | document/waiver screen | Yes | assignment ID + state | Existing waiver reminder producer; other document events remain producer-specific |
| Roster, role, team, and leave changes | membership/team/leave records | Parent/Athlete, Coach, Org Admin | current affected member or authorized staff | `roster` | roster or leave review | Yes | request/membership ID + state | Role and leave producers wired; team-event coverage requires each mutation route to use shared service |
| Attendance reminders | sessions/attendance | Coach, Org Coach, Parent/Athlete | assigned coach/athlete | `attendance` | attendance/session screen | Yes | session ID + reminder window | Reminder producer contract ready |
| League registrations, games, compliance | league records | League Admin and affected tenants | current league membership/permission | `registrations`, `schedule`, `results`, `documents` | league resource | Yes | league record ID + state | Schema and routing ready; each league mutation must call shared service |
| Webhook failures | Stripe webhook event ledger | Superadmin | active admin/superadmin | `security` | `/admin/webhooks` | No | Stripe event ID | Wired for platform and Connect webhooks |
| Tenant/workspace and security failures | security/operations ledger | Superadmin | active admin/superadmin | `security`, `account` | admin operations/security | No | incident/request ID | Shared superadmin producer ready; call from authoritative failure handler |

## Tap-time access rule

The notification inbox excludes expired items and workspace-scoped items when the user no longer has an active workspace membership. Platform admins may inspect platform alerts across workspaces. Resource endpoints must still reauthorize access when the destination opens.
