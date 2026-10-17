# Coaches Hive Web Engineering Rules

These instructions apply to the maintained Next.js web application under `src/`. They extend the shared repository-root engineering contract without replacing it.

## API Route Conventions

- Use Next.js App Router route handlers under `src/app/api/**/route.ts`; API route folders use kebab-case.
- Keep server-only code and secrets out of client components. Reuse `@/lib` authentication, Supabase, Stripe, request-security, and error helpers instead of creating parallel implementations.
- Validate request headers, path/query values, and JSON bodies before mutations. Return explicit HTTP status codes and stable JSON contracts.
- Preserve mobile/web contract compatibility. Do not silently rename request fields, response fields, statuses, or error codes.
- User-visible writes must follow `UI -> API/server action -> Supabase/Stripe -> automated test` and refresh authoritative state after success.

## Bearer-Token Authentication

- Every `/api/mobile/**` route must authenticate `Authorization: Bearer <Supabase access token>` and resolve the Supabase user from that token.
- Mobile routes must not require or fall back to browser cookies. Missing, malformed, expired, or invalid bearer credentials return a stable `401` response.
- Browser routes may use established cookie/session helpers where appropriate; never weaken mobile bearer requirements to accommodate browser behavior.
- Never log bearer tokens, session cookies, authorization headers, or decoded credentials.

## Workspace Authorization

- Treat authentication and authorization as separate checks. A valid user is not automatically authorized for a workspace or record.
- Parse and validate `X-Workspace-ID` for workspace-scoped mobile operations. Resolve an active `business_workspaces` row and confirm its organization or league matches the target record.
- Authorize with active `workspace_memberships`, acting role, and canonical permission RPCs. Support documented legacy membership paths only during migration.
- Verify tenant ownership again on every loaded or mutated record. Return a stable `403` or workspace-mismatch error without revealing another tenant’s data.
- Superadmin authority must remain private and server-verified; never expose it as a selectable user-facing role.

## Stripe Connect Behavior

- Stripe is authoritative for money movement. Resolve whether the original transaction was a platform destination charge or a direct connected-account charge and perform follow-up actions in the same account context.
- Validate the organization’s connected account and payment/accounting workspace before creating refunds, charges, subscriptions, or transfers.
- Preserve the approved fee model, destination, transfer reversal, and application-fee behavior. Never infer successful payment from a client redirect.
- Use server-side Stripe only. Do not expose secret keys or allow clients to choose authoritative prices, account IDs, or refund totals.

## Request IDs, Errors, and Vercel Logging

- Generate or preserve a server request ID with the canonical request-security helper for every production API operation.
- Return the same ID in JSON as `request_id` and in the `X-Request-ID` response header on success and failure.
- Errors must contain a stable machine-readable code and safe actionable message using the exact consumer contract; do not replace server trace IDs with local client references.
- Emit structured Vercel logs with route, request ID, authenticated user ID, workspace ID, target record ID, authorization result, external-service context, safe error code, and reconciliation result where applicable.
- Never log tokens, webhook secrets, personal data, card/payment details, or raw upstream error bodies that may contain sensitive information.

## Idempotency and Retry Handling

- Require stable idempotency keys for retryable financial or enrollment mutations and validate matching header/body keys when the contract supplies both.
- Prefer database-owned keys for money movement. Pass the same key to Stripe and reuse it for every retry of the same intent.
- A retry must return or reconcile the existing result; it must not duplicate registrations, holds, checkout sessions, refunds, ledger entries, notifications, or receipts.
- Claim mutable work atomically before external side effects. Do not extend reservations or capacity holds indefinitely on retries.
- Distinguish retryable infrastructure failures from final validation, authorization, state-conflict, and capacity failures.

## Webhook Reconciliation

- Stripe webhooks are authoritative for asynchronous payment completion and subscription state. Client redirects may refresh state but must not fulfill purchases.
- Pass Stripe event ID, type, and creation time through canonical reconciliation RPCs. Treat duplicate and stale events as successful no-ops.
- Only perform downstream fulfillment when the canonical RPC says the event was applied.
- Preserve financial history and receipts. Never delete payment, registration, refund, transfer, or reconciliation records to “fix” state.
- Slack, notifications, analytics, email, and reporting are non-authoritative; their failure must not roll back or misreport a successful primary transaction.

## Automated API Tests

- Add focused Playwright/request-level contract tests for every changed API route.
- Cover success, missing/invalid bearer token, insufficient permission, wrong workspace/tenant, malformed input, legacy data, duplicate retry, partial external failure, and safe error serialization.
- Payment changes must also cover Stripe failure, webhook replay/out-of-order delivery, database reconciliation failure, and Connect account context.
- Prefer behavior-level assertions. Source-contract checks may protect critical names/signatures but do not replace runtime or integration coverage.
- Before handoff run TypeScript validation, focused tests, `npm run build`, relevant migration/parity audits, and `git diff --check`.

## Deployment Verification

- Deploy the exact tested commit. Report its commit SHA, Vercel deployment ID, production URL, and changed files.
- Wait for Vercel `READY`; a successful upload or compilation alone is not a completed deployment.
- Probe the production route with a safe non-mutating or intentionally unauthenticated request to confirm method, status, response schema, and `X-Request-ID`.
- Use Vercel request/runtime logs to verify the deployed path and correlated server request ID. Never treat a cron `200` as proof that each downstream delivery succeeded.
- Do not execute a live charge, refund, cancellation, or destructive mutation merely as a deployment probe. Clearly state when production money movement was not exercised.
