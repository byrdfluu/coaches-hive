# Locked Behavior Review

This document records the first locked-flow review against `docs/locked-behavior.md`.

## Scope Reviewed

- auth and portal routing
- role activation and role switching
- lifecycle and onboarding handoff
- org creation and checkout continuation
- billing plan source-of-truth lookups
- coach public profile visibility and messaging/privacy enforcement
- guardian approval gating in messaging and booking flows

## Findings

### Fixed

- `src/app/api/roles/active/route.ts` previously ignored `supabase.auth.updateUser(...)` failures.
  Impact: role activation could fail server-side without the API surfacing the failure, which risked silent routing drift in locked auth flows.
  Fix: the route now returns a real error when the `active_role` write fails.

- `src/app/org/onboarding/page.tsx` and `src/app/coach/dashboard/page.tsx` previously continued org checkout handoff even if `/api/roles/active` failed.
  Impact: org onboarding could continue after organization creation without a confirmed portal-role activation.
  Fix: both flows now stop and show the real activation failure instead of silently continuing.

### Reviewed And Currently Aligned

- default sign-in routing still prefers coach before org when the user has both roles and no explicit portal intent
- explicit coach portal intent is preserved through login
- login still blocks continuation when requested role activation fails
- auth callback still preserves `profiles.role` and only updates auth metadata
- org creation still hands off into checkout and existing orgs still resume checkout
- billing info still prefers saved DB plan state, with Stripe timing layered on top
- public coach messaging and booking still respect saved privacy and guardian-approval rules
- certification sections remain hidden when there is no certification content on the coach profile page

## Remaining Risk

- `src/middleware.ts` remains structurally dense even after the applied fixes, so future locked-flow changes in auth or billing should still be reviewed against `docs/locked-behavior.md` before edits.

## Verification

- `npm run lint`
- `npm run build`
- manual runtime spot checks:
  - `POST /api/roles/active` without a session returns `401`
  - `/org/onboarding` without a session redirects to login
  - `/coach/dashboard` without a session redirects to login with preserved coach intent

## Test Note

- No new automated test was added for the role-activation failure path because it depends on authenticated Supabase metadata writes and the repo does not currently have a focused test harness for forcing that server-side failure deterministically.
