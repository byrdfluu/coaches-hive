# Web and iOS portal capability parity

The authoritative runtime catalog is `GET /api/mobile/capabilities`. It accepts the web session cookie or an iOS Supabase bearer token and resolves identity, workspace, organization, role, and grants on the server. Existing browser routes remain protected by the same workspace authority service. The iOS repository must consume this endpoint before parity can be marked verified.

| Product area | Organization | Coach | Parent/family | Web | iOS |
|---|---|---|---|---|---|
| Dashboard, profile, notifications, settings, support | Manage/view by role | Manage own | Manage own/family | Yes | Yes |
| Teams, coaches, contacts, permissions | Manage by organization grant | View affiliations | View affiliations | Yes | Yes |
| Calendar, games, attendance | Manage by organization grant | Manage assigned schedule | View/respond | Yes | Yes |
| Messaging and notes | Manage by organization grant | Manage assigned users | Manage own | Yes | Yes |
| Waivers and compliance | Manage by organization grant | Assign/track | Sign/view | Yes | Yes |
| Tryouts and programs | Manage | Manage own programs | Register/pay | Yes | Yes |
| Marketplace and orders | Sell/refund | Sell/refund | Buy/request refund | Yes | Yes |
| Registrations | Create/monitor | View when assigned | Submit/pay | Yes | App implementation required |
| Recurring dues | Create/waive/monitor | View team collections | Autopay/pay | Yes | App implementation required |
| Events | Create/split/monitor | View team events | Partial pay | Yes | App implementation required |
| Facilities | List/book/refund | List/book/refund | Book/cancel | Yes | App implementation required |
| Fundraising | Create/monitor | View team campaigns | Contribute | Yes | App implementation required |
| Unified payment center | Organization scope | Coach scope | Family scope | Yes | App implementation required |
| Equipment, travel, insurance/compliance checkout | Reserved only | Reserved only | Reserved only | Not launched | Not launched |

Platform-specific presentation may differ, but a capability is considered equal only when both clients can reach the same server action, receive the same statuses and integer-cent values, and are subject to the same authorization decision.

## iOS acceptance gate

Parity is complete only after the app repository:

1. Loads `GET /api/mobile/capabilities` with `Authorization: Bearer <Supabase access token>` and the active `x-workspace-id` header.
2. Hides or disables portal actions according to each capability's `view`, `manage`, `pay`, `waive`, and `refund` grants.
3. Uses the mobile registration, dues, event, facility, fundraising, and payment-dashboard endpoints documented in `docs/mobile-payment-api.md`; it must not calculate fees or write ledger rows directly.
4. Stores and computes every monetary amount as integer cents, displaying dollars only at the view boundary.
5. Passes native tests for organization creation/monitoring, coach visibility, family payment actions, authorization denial, idempotent retries, and Stripe-confirmed status refresh.
