# Coaches Hive Engineering Contract

These instructions apply to all work in this repository. Follow the most specific
nested `AGENTS.md` if one is added later. Preserve unrelated user changes.

## Working Style

- Implement requested work directly unless a missing decision materially changes product behavior.
- Treat screenshots as evidence of symptoms, not proof of root cause.
- Audit existing code, schema, migrations, and contracts before changing them.
- Follow a feature through every affected portal and downstream system.
- Prefer extending canonical models and services over creating parallel implementations.
- Keep explanations practical. Finish with exactly what changed and what the user must do next.
- When web work is required, provide a complete copy-ready web-team prompt.

## Definition of Done

- Do not call a workflow fixed merely because code compiles or SQL executes.
- Verify the relevant UI, authorization, API, database, payment, notification, and reporting path.
- Label status accurately: implemented locally, SQL prepared, SQL installed, web deployment required,
  TestFlight build required, or production verified.
- Never present an unverified theory as a confirmed root cause.
- Do not ask the user to retest until every required layer available in this repository is ready.

## Database and SQL

- Verify every referenced table, column, constraint, enum, trigger, and function signature first.
- Account for legacy records and production schema drift; never assume a recent migration was installed.
- Make migrations transactional and safely rerunnable where practical.
- Use precise validation checks; avoid broad text matching that can produce false positives.
- Include focused contract/validation SQL for substantial migrations.
- Reload the PostgREST schema cache when RPC signatures or exposed functions change.
- If SQL fails inside a transaction, correct the source migration and say whether the full file must rerun.
- Never let Slack, notifications, analytics, telemetry, or reporting roll back a primary transaction.
- Keep business operations atomic, auditable, and idempotent.

## Payments, Refunds, and Credits

- Stripe is authoritative for money movement. Mobile clients and SQL must not impersonate a refund.
- Execute refunds on the authenticated server in the original Stripe/Connect account context.
- Use database-owned idempotency keys and mark completion only after Stripe confirmation.
- Preserve payments, receipts, registrations, refund requests, and financial audit history.
- Treat withdrawal, future-attendance cancellation, subscription cancellation, credit return, and money
  refund as separate actions with explicit outcomes.
- Credits and money are separate ledgers. Returning one never implies returning the other.
- Never allow negative credit balances. Make grants, use, returns, reversals, and expiration idempotent.
- Credit views should identify organization, athlete, source offering/package, credit type, remaining,
  issued, used, expiration, status, and adjustment reason.

## Offerings and Enrollment

- An abandoned or started checkout is not an enrollment and must not consume permanent capacity.
- Only confirmed registrations count toward enrollment, deletion protection, and reporting.
- Expired unpaid holds must release capacity automatically.
- Allow deletion only when no protected history exists; otherwise close, cancel, or archive.
- Hide expired one-time offerings from family discovery; do not hide recurring monthly offerings solely
  because an individual occurrence passed.
- Organization and family portals must derive visibility, status, capacity, and eligibility from the same
  authoritative contract.
- Withdrawal releases future reservations immediately. Free disposable registrations may be removed;
  paid registrations retain financial history in a cancelled state.
- Do not show session counts for whole-program enrollment. Use fulfillment-appropriate language.

## Authorization and Portal Context

- Parent/athlete, coach, organization, league, and superadmin are distinct authorization contexts.
- One user may have multiple roles and workspaces. Resolve active portal and workspace for every request.
- Use canonical athlete ownership checks for family actions.
- Support canonical workspace memberships plus required legacy membership paths during migration.
- Scope notifications, unread counts, messaging identity, data, and actions to the active portal.
- Test users with multiple roles, athletes, organizations, and workspaces.

## UI and Loading

- Render permanent navigation and discovery entry points immediately.
- Keep cards and sections stable while their content loads; avoid late insertion and layout jumps.
- Provide distinct loading, empty, error, retry, success, and disabled states.
- Refresh authoritative data after successful mutations.
- Format dates, times, money, names, and statuses for people; never expose raw ISO timestamps.
- Destructive confirmations must state what stops, what remains, and what happens to money, credits,
  subscriptions, enrollment, and future reservations.
- Make the primary action obvious; do not require an unexplained preview step to save or publish.

## APIs, Errors, and Observability

- Keep mobile and web request/response contracts documented and aligned.
- Mobile web routes must accept bearer authentication and must not require browser cookies.
- Production errors must include a stable error code, safe message, and server-generated request ID.
- Return the request ID in JSON and `X-Request-ID`, and log the same ID server-side.
- Preserve server status, code, message, and request ID through client error handling.
- Do not generate a local reference and describe it as server-traceable.
- Distinguish authentication, authorization, validation, deployment, database, and Stripe failures.
- Never log tokens, credentials, medical information, or sensitive payment data.

## Reporting and Operations

- Evaluate every feature for organization reporting, superadmin monitoring, audit history, exports,
  reconciliation, and failure queues.
- Reports must use authoritative transactional data, not UI caches.
- Track abandoned checkout separately from enrollment; withdrawal separately from refund.
- Track refund lifecycle and credit issuance, use, return, reversal, liability, and expiration.
- Exclude test and sandbox records from production metrics.
- Metrics should have useful drill-downs and actionable failure detail.

## Verification and Handoff

- Run an Xcode build after Swift changes. Run focused tests proportional to risk.
- Cover success, unauthorized access, wrong workspace, retries, legacy data, empty states, and partial failure.
- Preserve unrelated worktree changes and avoid destructive Git/database operations without authorization.
- At handoff, explicitly state which are required: SQL, web deployment, new TestFlight build, or none.
- When several layers changed, give the deployment order.
- A successful SQL-editor result proves execution only—not that the full product workflow works.
