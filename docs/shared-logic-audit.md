# Shared Logic Audit

This document captures the remediation pass for the shared logic called out in the P1 checklist:

- `src/lib/apiAuth.ts`
- `src/lib/lifecycleOrchestration.ts`
- `src/lib/guardianApproval.ts`
- `src/lib/stripeServer.ts`

## Summary

This pass focused on cross-cutting auth and lifecycle correctness rather than large refactors. The concrete issues fixed were:

- `apiAuth` now canonicalizes legacy admin-team metadata to `admin` even when routes call `getSessionRole()` without an allowlist.
- `lifecycleOrchestration` no longer treats any truthy raw `activeTier` value as an active subscription when the tier is invalid for the actor's role.
- `guardianApproval` no longer auto-links an athlete to a non-guardian profile just because the email matches `guardian_email`.
- shared session-role decoding now lives in `src/lib/sessionRoleState.ts`, so middleware and route handlers no longer hand-roll raw `user_metadata` parsing.

## Findings And Fixes

### 1. `getSessionRole()` leaked legacy admin team roles on no-allowlist routes

Relevant file:

- `src/lib/apiAuth.ts`

Previous behavior:

- `getSessionRole(allowedRoles)` used canonicalized role candidates.
- `getSessionRole()` without `allowedRoles` returned the first raw metadata role instead.
- That meant users with legacy admin-team metadata such as `support`, `finance`, or `ops` could still surface those raw values in some route handlers even after admin access had been normalized elsewhere.

Applied fix:

- `getSessionRole()` now prefers canonicalized role candidates even without an allowlist.
- Shared auth behavior is now consistent between middleware and route handlers.

### 2. Lifecycle snapshots trusted invalid active-tier values

Relevant file:

- `src/lib/lifecycleOrchestration.ts`

Previous behavior:

- `buildLifecycleSnapshot()` treated any truthy raw `activeTier` as proof of an active plan.
- If the DB returned a tier string that was invalid for that role, the snapshot could still force the user into the `active` state.

Applied fix:

- The fast path now requires a normalized active tier for the actor's lifecycle role before it marks the account active.

### 3. Guardian auto-linking trusted any matching email

Relevant file:

- `src/lib/guardianApproval.ts`

Previous behavior:

- `resolveGuardianUserIdForAthlete()` would auto-link to any non-self profile whose email matched `guardian_email`.
- That could incorrectly create a guardian link to a non-guardian account if the email existed on another profile.

Applied fix:

- Auto-linking now rejects matched profiles whose `account_owner_type` is present and not `guardian`.
- Legacy blank `account_owner_type` rows still pass through to avoid breaking older data during migration.

### 4. `stripeServer` audit result

Relevant file:

- `src/lib/stripeServer.ts`

Review result:

- No immediate code defect was found in this pass.
- The module already fails closed when `STRIPE_SECRET_KEY` is missing by throwing on access instead of silently creating a partially configured client.

### 5. Shared session-role decoding was duplicated across middleware and route handlers

Relevant file:

- `src/lib/sessionRoleState.ts`

Previous behavior:

- multiple files decoded `user_metadata.role`, `active_role`, `roles`, `selected_tier`, and `lifecycle_state` independently
- those call sites did not all apply the same canonical admin-role behavior

Applied fix:

- introduced `src/lib/sessionRoleState.ts` as the shared decoder for session role, tier, lifecycle, and admin access context
- switched `src/lib/apiAuth.ts`, `src/middleware.ts`, and the auth-sensitive API handlers onto it

## Residual Risk

- `lifecycleOrchestration` and middleware still share some billing and onboarding assumptions indirectly. They are safer than before, but not yet decomposed into a smaller policy surface.
