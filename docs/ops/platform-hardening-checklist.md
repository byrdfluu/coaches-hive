# Platform Hardening Checklist

This is the execution checklist for making Coaches Hive save logic, business flows, and messaging behavior reliable in production.

## Hardening Standard

Every critical flow must meet all of the following:

- Use one canonical server-side write path.
- Validate request payloads before writing.
- Write only to known schema columns/tables.
- Read the saved record back immediately after write.
- Update the UI from the saved record, not guessed local state.
- Return explicit success and error payloads.
- Emit a structured flow event on success and failure.
- Pass `npm run lint` and `npm run build`.

## Source Of Truth

- User profile settings: `public.profiles`
- Org settings and billing display state: `public.org_settings`
- Org identity: `public.organizations`
- Organization membership and role access: `public.organization_memberships`
- Marketplace products/drafts: `public.products`
- Message threads and messages: `public.message_threads`, `public.messages`, `public.thread_participants`
- Message receipts and attachments: `public.message_receipts`, `public.message_attachments`
- Subscription checkout state: Stripe checkout + webhook sync + plan tables/settings rows

## Critical Flows

### Save Logic

- [ ] Coach settings save
- [ ] Coach public profile sync after save
- [ ] Athlete settings save
- [ ] Athlete public profile sync after save
- [ ] Org settings save
- [ ] Branding/logo save and re-read
- [ ] Availability save and edit
- [ ] Marketplace draft save
- [ ] Marketplace publish/update save
- [ ] Notes save
- [ ] Notification preference save
- [ ] Integration settings save

### Business Flows

- [ ] Signup
- [ ] Email verification
- [ ] Login
- [ ] Session recovery after invalid token
- [ ] Role switching
- [ ] Coach-to-org onboarding handoff
- [ ] Org creation
- [ ] Stripe subscription checkout handoff
- [ ] Stripe checkout success/cancel return
- [ ] Booking creation
- [ ] Calendar subscription handoff
- [ ] Password reset

### Messaging And Connections

- [ ] Create thread
- [ ] Send message
- [ ] Send message with attachment
- [ ] Read receipts
- [ ] Coach-athlete direct messaging rules
- [ ] Org messaging
- [ ] Guardian invites
- [ ] Guardian approvals
- [ ] Org membership invites
- [ ] Team assignment links

## Verification Matrix

For each flow above:

- [ ] Success path verified
- [ ] Refresh/reload keeps saved state
- [ ] Linked page reflects saved state
- [ ] Validation rejects bad input
- [ ] User sees a real error when the write fails
- [ ] Flow event is emitted on success
- [ ] Flow event is emitted on failure

## Current Implementation Targets

### Shared Hardening Layer

- [x] Structured server flow telemetry utility
- [x] Profile save route returns saved record
- [x] Org create route emits success/failure events
- [x] Stripe checkout route emits success/failure events
- [x] Message send route emits success/failure events

### Next Pass

- [x] Apply the same readback + telemetry pattern to org settings save
- [x] Apply the same readback + telemetry pattern to coach product create/update
- [x] Apply the same readback + telemetry pattern to bookings
- [x] Apply the same readback + telemetry pattern to org invites and guardian flows
- [x] Add route-level tests for the flows above
  Notes: athlete route-level coverage now lives in `tests/athlete-portal-api.spec.ts`.
- [x] Add a smoke checklist per portal for live verification
  Notes: athlete portal smoke verification now lives in `docs/athlete-portal-smoke-checklist.md`.
