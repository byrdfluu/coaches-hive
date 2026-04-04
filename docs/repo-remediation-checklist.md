# Repo Remediation Checklist

This checklist tracks the prioritized cleanup and hardening work for the maintained app in `chmain/CHMain`.

## P0

- [x] Remove committed Sentry auth token from `CI`.
  Evidence: workflow file previously embedded a live `SENTRY_AUTH_TOKEN`.
  Fix: replaced inline token with `${{ secrets.SENTRY_AUTH_TOKEN }}`.
  Follow-up: rotate the previously exposed Sentry token in Sentry/GitHub immediately.

- [x] Verify local env files are not tracked by Git.
  Evidence: `.env.local` is ignored by `.gitignore` and `git ls-files --error-unmatch .env.local` fails as expected.
  Fix: documented local env usage in `.env.example`.
  Follow-up: keep real secrets only in local env files or the deployment secret manager.

## P1

- [x] Audit and simplify auth and routing behavior in `src/middleware.ts`.
  Deep dive required: yes
  Notes: first-pass findings captured in `docs/middleware-deep-dive.md`.
  Progress: tightened `/org/*` route classification so portal pages like `/org/support` and `/org/audit` no longer fall through as public.
  Progress: replaced drift-prone admin and org permission prefix checks with explicit route-entry maps covering the current route tree.
  Progress: redirected legacy public org pages from `/org/[slug]` to canonical `/organizations/[slug]`.
  Progress: unified admin access resolution across middleware, shared helpers, and admin route handlers so canonical `admin`/`superadmin` and legacy team-role metadata are interpreted consistently.
  Progress: protected the bare `/admin` landing route and added persisted billing-status fallback for stale-JWT billing enforcement.
  Progress: extracted route policy tables into `src/lib/middlewarePolicy.ts` and session-role parsing into `src/lib/sessionRoleState.ts`.
  Progress: extracted account-state, lifecycle, and billing enforcement into `src/lib/middlewareEnforcement.ts`.
  Progress: extracted admin permission/security enforcement and org membership/permission enforcement into `src/lib/middlewareEnforcement.ts`.
  Residual risk: the file is now mostly orchestration glue, but it still sequences several portal-policy branches and could be split further by domain in a later refactor pass.

- [x] Review locked flows against `docs/locked-behavior.md`.
  Deep dive required: yes
  Notes: review findings captured in `docs/locked-behavior-review.md`.
  Progress: fixed silent role-activation failure handling in `/api/roles/active`.
  Progress: fixed org checkout handoff so onboarding does not continue when portal-role activation fails.

- [x] Audit critical shared logic in:
  `src/lib/apiAuth.ts`,
  `src/lib/lifecycleOrchestration.ts`,
  `src/lib/guardianApproval.ts`,
  `src/lib/stripeServer.ts`.
  Deep dive required: yes
  Notes: review findings captured in `docs/shared-logic-audit.md`.
  Progress: canonicalized admin-team roles in `apiAuth` even on no-allowlist routes.
  Progress: hardened lifecycle snapshots to require a normalized active tier before treating a user as active.
  Progress: prevented guardian auto-linking to non-guardian profiles that only match by email.
  Progress: centralized session role, tier, lifecycle, and admin access decoding in `src/lib/sessionRoleState.ts`.

- [x] Review sensitive App Router endpoints in `src/app/api` for auth, validation, and role enforcement consistency.
  Deep dive required: yes
  Notes: review findings captured in `docs/api-audit-review.md`.
  Progress: added missing booking payload validation for duration and time ordering.
  Progress: replaced the stale private auth helper in `/api/memberships` with the shared auth helper.
  Progress: aligned refund/review route-level admin checks with the shared admin access resolver.
  Progress: removed direct session role/tier/lifecycle metadata reads from the audited API surface and switched those handlers onto `src/lib/sessionRoleState.ts`.
  Residual risk: `src/app/api` is still broad, but the session metadata drift called out in this audit is now centralized.

## P2

- [x] Review Playwright coverage in `tests` and identify gaps around auth, billing, and locked flows.
  Deep dive required: moderate
  Notes: findings captured in `docs/test-coverage-review.md`.
  Progress: documented the current Playwright harness in `playwright.config.ts` and the existing high-risk coverage already present in `tests`.
  Progress: added `tests/middleware-locked-routes.spec.ts` to cover unauthenticated admin/org portal redirects, legacy org canonicalization, the public org API contract, and JSON `401` behavior on a protected API.

- [x] Classify duplicate or archival folders before cleanup: `coachhive/`, `CoachesHive/Figma/*`, and the partial root `src/`.
  Deep dive required: moderate
  Notes: findings captured in `docs/repo-area-classification.md` and mirrored at the workspace root in `README.md`.
  Progress: marked `chmain/CHMain` as the maintained source of truth and classified the other workspace trees as archival or duplicate.
  Progress: confirmed the workspace-root `src/` tree is not referenced by the wrapper manifests and should not be treated as live application source.
  Progress: removed `coachhive/`, `CoachesHive/Figma/`, and the duplicate workspace-root `src/` tree after classification.

- [x] Reconcile stale docs such as `CLAUDE.md` against current manifests and code.
  Deep dive required: no
  Notes: updated `CLAUDE.md` to match the current Next.js version, CI Node version, middleware helper structure, and source-of-truth repo layout.
  Progress: completed a final deployment and secret-handling review in `docs/deployment-secrets-review.md`.
