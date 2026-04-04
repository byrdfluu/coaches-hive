# App Router API Audit

This document captures the remediation pass for the sensitive App Router handlers under `src/app/api`.

## Summary

This pass targeted concrete auth, validation, and role-enforcement gaps that were still inconsistent with the shared middleware and admin-role model.

Applied fixes:

- added missing booking payload validation in `src/app/api/bookings/route.ts`
- removed a stale route-local auth helper from `src/app/api/memberships/route.ts`
- switched remaining direct admin-role checks in several handlers onto the shared admin access resolver
- removed direct session role/tier/lifecycle metadata decoding from the audited API routes by switching them onto `src/lib/sessionRoleState.ts`

## Findings And Fixes

### 1. Booking creation accepted invalid durations and inverted times

Relevant file:

- `src/app/api/bookings/route.ts`

Previous behavior:

- `duration_minutes` could be zero or negative.
- `end_time` could be equal to or earlier than `start_time`.

Applied fix:

- booking creation now rejects non-positive durations
- booking creation now rejects `end_time <= start_time`

### 2. Memberships API carried a stale private auth helper

Relevant file:

- `src/app/api/memberships/route.ts`

Previous behavior:

- the route defined its own `getSessionRole()` helper instead of using `src/lib/apiAuth.ts`
- that helper read `session.user.user_metadata.role` directly
- `superadmin` and legacy admin-team metadata could diverge from the shared admin-role model

Applied fix:

- the route now uses the shared `getSessionRole()` and `jsonError()` helpers
- route behavior now follows the same canonical admin resolution as the rest of the app

### 3. Several routes still bypassed shared admin access resolution

Relevant files:

- `src/app/api/coach/reviews/response/route.ts`
- `src/app/api/marketplace/orders/[id]/refund-request/route.ts`
- `src/app/api/payments/sessions/[id]/refund-request/route.ts`

Previous behavior:

- these handlers performed final authorization checks against raw `session.user.user_metadata.role`
- that could deny valid admin-team or `superadmin` access even when the shared auth layer had already treated the user as an admin

Applied fix:

- the handlers now use `resolveAdminAccess(...)` for their final admin check
- shared auth and route-level authorization are now aligned for these flows

### 4. Session metadata parsing was scattered across API routes

Relevant files:

- `src/app/api/roles/active/route.ts`
- `src/app/api/roles/available/route.ts`
- `src/app/api/stripe/subscription/checkout/route.ts`
- `src/app/api/org/create/route.ts`
- `src/app/api/stripe/billing-info/route.ts`
- `src/app/api/profile/save/route.ts`
- `src/app/api/invites/athlete/route.ts`
- `src/app/api/invites/athlete/bulk/route.ts`
- `src/app/api/invites/coach/route.ts`
- `src/app/api/support/tickets/route.ts`
- `src/app/api/referrals/route.ts`
- `src/app/api/demand-signals/route.ts`
- `src/app/api/org/invites/respond/route.ts`
- `src/app/api/calendar/ical/route.ts`

Previous behavior:

- these handlers directly read `user_metadata.role`, `active_role`, `roles`, `selected_tier`, or `lifecycle_state`
- that made auth and billing behavior depend on each file reimplementing the same parsing rules

Applied fix:

- introduced `src/lib/sessionRoleState.ts` and switched the audited handlers onto it
- there are now no remaining direct session role/tier/lifecycle metadata reads in `src/app/api`, `src/lib`, or `src/middleware.ts`

## Residual Risk

- `src/app/api` is still large, but the specific session role/tier/lifecycle metadata drift identified in this audit has been centralized.
- Future cleanup can focus on broader route shape and domain boundaries instead of raw session metadata parsing.
