# Test Coverage Review

This review closes the remaining `P2` testing item for the maintained app in `chmain/CHMain`.

## Current Harness

- Playwright is the only committed test harness.
- Config lives in `playwright.config.ts`.
- The suite runs against `./tests`, starts the app with `npm run dev`, uses a single worker, and defaults to WebKit on `http://localhost:3000`.

## Existing Coverage

- `tests/api-critical.spec.ts` exercises validation and unauthenticated contracts for high-risk endpoints like signup, guardian approvals, payments, and Stripe webhooks.
- `tests/auth-role-flows.spec.ts` covers unauthenticated route protection and role-based access behavior, with optional credential-backed flows when test accounts are configured.
- `tests/lifecycle-verification-flow.spec.ts` covers the lifecycle helper behavior that decides verification and next-step routing.
- `tests/guardian-invite.spec.ts`, `tests/waiver-signing.spec.ts`, `tests/marketplace-cart.spec.ts`, `tests/signup.spec.ts`, `tests/ui.spec.ts`, and `tests/smoke.spec.ts` provide additional UI and flow coverage.

## Gap Review

Before this pass, the biggest remaining gap was a focused regression test around the middleware fixes that landed during the hardening work:

- locked unauthenticated redirects for `/admin` and authenticated org-portal pages like `/org/support`
- canonical redirect behavior for legacy public org URLs under `/org/[slug]`
- confirmation that the public org API did not get pulled behind login during middleware cleanup
- confirmation that a private API still returns JSON `401` instead of a redirect

## Added Coverage

`tests/middleware-locked-routes.spec.ts` now covers those contracts at the request layer:

- `/admin` and `/admin/settings` redirect to login when unauthenticated
- `/org/support` and `/org/audit` redirect to login when unauthenticated
- `/org/demo-org` redirects to `/organizations/demo-org`
- `/api/org/public?slug=demo-org` remains public and does not redirect to login
- `/api/memberships` still returns JSON `401` without a session

`tests/athlete-portal-api.spec.ts` now adds athlete route-level coverage for the launch-critical athlete APIs:

- `POST /api/profile/save` auth guard and no-valid-fields validation
- `POST /api/bookings` auth guard and required-field validation
- `POST /api/messages/thread` auth guard and title validation
- `POST /api/messages/send` auth guard and body/attachment validation

Like the existing auth-role tests, the validation half of that spec becomes credential-backed when `E2E_ATHLETE_EMAIL` and `E2E_ATHLETE_PASSWORD` are configured. Without them, the unauthenticated contract checks still run.

Like the repo's credential-backed auth specs, this middleware contract spec is optional when local app env is missing. It requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` so the app can boot far enough to serve request-level assertions.

## Residual Testing Risk

- The repo is still E2E-heavy. There is no dedicated fast unit/integration harness for server helpers that depend on Supabase or Stripe behavior.
- Credential-backed flows still depend on local test accounts when full end-to-end role switching is needed.
- Request-level route tests still depend on baseline app env. In an env-empty shell, Next.js can return `500` before those route contracts are exercised.
- Failure-path coverage for external-provider writes, such as forced Supabase metadata write failures, remains mostly manual because the current suite does not mock those internals directly.

For the current remediation pass, the highest-risk middleware and locked-route contracts are now explicitly covered.
