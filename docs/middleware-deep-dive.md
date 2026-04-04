# Middleware Deep Dive

This document captures the first-pass audit of `src/middleware.ts` and the route/auth helpers it depends on.

## Scope

- `src/middleware.ts`
- `src/lib/roleRedirect.ts`
- `src/lib/lifecycleOrchestration.ts`
- `src/lib/adminRoles.ts`
- `src/lib/apiAuth.ts`
- login and auth callback flow
- route trees under `src/app/org`, `src/app/admin`, `src/app/api/org`, and `src/app/api/admin`

## Summary

`src/middleware.ts` is acting as a policy engine, not just middleware. It currently combines:

- API rate limiting
- content-type enforcement
- session checks
- portal role routing
- lifecycle gating
- billing recovery gating
- admin permission checks
- admin network/MFA/SSO enforcement
- organization membership and org permission enforcement

That concentration creates drift risk, and the drift is already visible in route classification.

Applied remediations so far:

- replaced brittle `/org/*` public-route inference with explicit org portal prefixes
- replaced drift-prone admin and org permission prefix logic with explicit route-entry maps
- redirected legacy public org URLs from `/org/[slug]` to `/organizations/[slug]` in middleware
- added shared admin access resolution in `src/lib/adminRoles.ts` and switched middleware, redirect helpers, `apiAuth`, and admin route handlers onto it
- protected the bare `/admin` route instead of only `/admin/*`
- added a DB-backed billing-status fallback so canceled/past-due redirects do not rely solely on stale JWT metadata
- extracted route classification and permission tables into `src/lib/middlewarePolicy.ts`
- switched middleware session-role decoding onto `src/lib/sessionRoleState.ts`
- extracted account-state, lifecycle, and billing enforcement into `src/lib/middlewareEnforcement.ts`
- extracted admin permission/security enforcement and org membership/permission enforcement into `src/lib/middlewareEnforcement.ts`

## Findings

### 1. `/org/*` public-page detection is brittle and already misclassifies real portal pages

Relevant code:

- `src/middleware.ts:295`
- `src/middleware.ts:316`
- `src/middleware.ts:324`

Current behavior:

- `isOrgPublicPage` is inferred from a hardcoded set of known private segments.
- Any `/org/<segment>` route with exactly two path segments is treated as public if `<segment>` is not in that set.

Observed misclassified pages in the current tree:

- `src/app/org/audit`
- `src/app/org/stripe-setup`
- `src/app/org/support`
- `src/app/org/suspended`
- legacy `/org/[slug]` public URL

Impact:

- Auth and org-membership middleware checks are skipped for some non-public org pages.
- Today, many of those pages fetch protected APIs client-side, so data is still usually protected by route handlers.
- The page-level contract is still wrong, and any future server-rendered org page added under `/org/<new-segment>` can become unintentionally public unless the middleware list is updated.

### 2. Admin permission routing has drifted from the actual admin route tree

Relevant code:

- `src/middleware.ts:130`
- `src/middleware.ts:160`
- `src/middleware.ts:501`

Observed admin page directories not represented in `getAdminPermissionForPath`:

- `src/app/admin/athletes`
- `src/app/admin/audit`
- `src/app/admin/coaches`
- `src/app/admin/guardian-links`
- `src/app/admin/org-audit`
- `src/app/admin/orgs`
- `src/app/admin/retention`
- `src/app/admin/reviews`
- `src/app/admin/settings`
- `src/app/admin/waivers`

Observed admin API directories not represented in `getAdminPermissionForPath`:

- `src/app/api/admin/athletes`
- `src/app/api/admin/audit`
- `src/app/api/admin/env-check`
- `src/app/api/admin/guardian-links`
- `src/app/api/admin/health`
- `src/app/api/admin/metrics`
- `src/app/api/admin/notices`
- `src/app/api/admin/org-audit`
- `src/app/api/admin/orgs`
- `src/app/api/admin/retention`
- `src/app/api/admin/reviews`
- `src/app/api/admin/settings`
- `src/app/api/admin/waivers`

Impact:

- Middleware permission enforcement depends on hardcoded prefixes that no longer cover the real route surface.
- Some APIs do their own role checks, which reduces exposure.
- Page-level access becomes inconsistent, and future routes can silently default to weaker middleware gating.

### 3. Org permission enforcement also depends on a drifting hardcoded map

Relevant code:

- `src/middleware.ts:633`
- `src/middleware.ts:653`
- `src/middleware.ts:675`

Observed org page directories not represented in `permissionKeyMap`:

- `src/app/org/audit`
- `src/app/org/stripe-setup`
- `src/app/org/support`
- `src/app/org/suspended`
- legacy `/org/[slug]` public URL

Observed org API directories not represented in `apiPermissionMap`:

- `src/app/api/org/audit`
- `src/app/api/org/calendar`
- `src/app/api/org/contacts`
- `src/app/api/org/create`
- `src/app/api/org/join-requests`
- `src/app/api/org/notes`
- `src/app/api/org/onboarding`
- `src/app/api/org/public`
- `src/app/api/org/stripe`
- `src/app/api/org/waivers`

Impact:

- The org-membership guard and the org-role-permission guard are using different hardcoded views of the route tree.
- This makes permission behavior dependent on whether a route author remembered to update middleware, not just whether the route exists.

### 4. The admin role model is internally inconsistent

Relevant code:

- `src/lib/adminRoles.ts`
- `src/lib/roleRedirect.ts:32`
- `src/lib/roleRedirect.ts:73`
- `src/middleware.ts:379`
- `src/app/api/admin/actions/route.ts:14`

Observed behavior:

- The codebase models admin team roles via `admin_team_role`.
- `src/app/api/admin/actions/route.ts` only assigns admin team roles to users whose base role is `admin` or `superadmin`.
- But `src/lib/roleRedirect.ts` and `resolvePreferredSignInRole` still treat `support`, `finance`, and `ops` as if they may be primary roles.

Impact:

- The live model appears to be “base role = admin/superadmin, specialization = admin_team_role”.
- Some shared auth helpers still encode an older or parallel model.
- This is primarily a maintenance risk today, but it increases the chance of future auth regressions or incorrect assumptions during refactors.

### 5. Middleware owns too many independent policy concerns

Relevant code:

- `src/middleware.ts:18`
- `src/middleware.ts:208`
- `src/middleware.ts:348`
- `src/middleware.ts:420`
- `src/middleware.ts:471`
- `src/middleware.ts:596`

Impact:

- A single change can affect auth, onboarding, billing, and org/admin access together.
- The locked behavior in `docs/locked-behavior.md` depends heavily on this file, but the file is not structured around those product contracts.
- Safe changes will remain difficult until route classification and policy decisions are decomposed.

## Locked-Behavior Alignment

The middleware is directly responsible for several locked contracts in `docs/locked-behavior.md`, especially:

- coach-first routing for dual-role users
- preserving explicit portal intent through login
- `active_role` as the routing switch
- onboarding and billing handoff behavior

The coach-first flow appears intentionally supported through:

- `src/lib/roleRedirect.ts:48`
- `src/app/login/page.tsx`
- `src/app/auth/callback/route.ts`

That part should be treated as sensitive during refactor, because it is distributed across login, callback, lifecycle helpers, and middleware.

## Recommended Refactor Order

1. Replace hardcoded org page “public/private” inference with explicit route groups or an allowlist that reflects intentional public org routes only.
2. Separate route classification from enforcement in `src/middleware.ts`.
3. Centralize admin and org permission maps in shared constants, then make route handlers and middleware depend on the same source.
4. Normalize the admin role model so shared helpers stop implying `support`, `finance`, and `ops` are standalone base roles unless that is truly supported.
5. Add focused tests for:
   - dual-role coach-first sign-in
   - explicit coach portal intent through login
   - org page auth gating
   - org membership redirect behavior
   - admin permission routing

## Immediate Next Candidates

- Fix the `/org/*` route classification bug first.
- Then align admin and org permission maps with the actual route tree.

## Applied Remediation

- `src/middleware.ts` now uses an explicit `orgPortalPrefixes` allowlist for authenticated org portal routes.
- Legacy single-segment `/org/[slug]` public URLs are now redirected in middleware to `/organizations/[slug]`, while portal pages such as `/org/support`, `/org/audit`, and `/org/stripe-setup` no longer rely on the old “unknown segment means public” heuristic.
- `src/middleware.ts` now uses explicit admin page/API permission entries and explicit org page/API permission entries instead of partial hardcoded prefix branches.
- `src/middleware.ts` now protects `/admin` the same way it protects `/admin/*`, closing the gap where the admin landing page could bypass the session check.
- `src/middleware.ts` now re-checks persisted billing state for canceled and past-due users before enforcing billing redirects or API `402` responses, which reduces stale-JWT billing regressions.
- route classification, public-route allowlists, billing-recovery allowlists, and permission maps now live in `src/lib/middlewarePolicy.ts` instead of being embedded directly in the middleware file.
- middleware session-role parsing now flows through `src/lib/sessionRoleState.ts`, which removes duplicate raw `user_metadata` decoding inside the policy layer.
- middleware account-state, lifecycle, and billing decisions now flow through `src/lib/middlewareEnforcement.ts` instead of being embedded inline in the request handler.
- admin permission/security checks and org membership/permission checks now also flow through `src/lib/middlewareEnforcement.ts`, leaving `src/middleware.ts` primarily responsible for request classification and helper orchestration.

## Current Status

The high-risk middleware regressions identified in this audit have been fixed in the current remediation pass, and the structural drift risk is lower because the policy tables, session-role decoding, and all major enforcement blocks are no longer embedded directly in `src/middleware.ts`.

Residual risk still exists because `src/middleware.ts` remains the entry point that sequences auth and portal routing decisions. The remaining work is deeper decomposition or splitting by domain, not an unfixed concrete regression from this audit pass.
