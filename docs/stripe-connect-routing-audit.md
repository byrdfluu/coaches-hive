# Stripe Connect routing audit

## Result

Organization, independent-coach, and league Connect accounts are isolated by owner type. League fee checkout now resolves the assignment, payer, price, fee, league, and destination from Supabase; requires an enabled Connect account in the deployment's Stripe environment; creates a destination charge with a 4% application fee; and settles only from signed Stripe webhook events.

## Implemented payment paths

- Mobile organization fee, coach fee, league fee, program, tryout, installment, and marketplace checkout
- Public organization enrollment/program and tryout PaymentIntents
- Marketplace cart and direct marketplace checkout
- Organization charges and athlete charges
- Facility, event, fundraising, equipment, travel, registration, and dues through the canonical payment-intent path
- Organization recurring fees and coach memberships
- Platform subscriptions and onboarding payments (platform-owned; intentionally not Connect destination charges)

Every Connect checkout above resolves its destination server-side. The shared Connect-account loader requires charges, payouts, and submitted details before checkout. The canonical shared ledger is `payment_transactions`; Checkout-based Connect reconciliation is also upserted into `stripe_connect_payment_accounting` by PaymentIntent ID.

## League contract

- `POST /api/mobile/connect/start` accepts `role=league` plus `league_id`, verifies an active league and active administrator or `manage_payments` permission, and creates or reuses one Express account.
- `POST /api/mobile/checkout` accepts `type=league_fee` plus `record_id`. Athlete assignments require owner/active-guardian authority. Organization assignments require an active organization billing administrator. League finance staff cannot use this endpoint to charge an unrelated payer.
- Client price, description, owner, destination, league, and fee values are ignored.
- `paid`, `processing`, `waived`, `refunded`, `disputed`, and deleted assignments cannot start another checkout.
- Checkout writes only `processing`; browser success URLs cannot mark an assignment paid.

## Webhook and accounting

The webhook verifies the raw-body Stripe signature and reserves `stripe_webhook_events.event_id` before processing. Duplicate completed events therefore do not duplicate settlement, accounting, audit events, or notifications.

League settlement supports completed/async Checkout, expired Checkout, processing/succeeded/failed/canceled PaymentIntents, refunds, and disputes. Completion validates the database amount, league destination, environment, and exact 4% application fee before updating the assignment. Accounting stores gross, application fee, actual Stripe processing fee when the expanded balance transaction supplies it, recipient net, currency, session, PaymentIntent, charge, payer metadata, destination, and livemode.

Stripe may deliver `payment_intent.succeeded` before `checkout.session.completed`. The former validates routing and updates the shared ledger; the latter performs assignment settlement so event order cannot cause the Checkout event to fail against an already-paid assignment.

## Refund policy

The centralized refund service intentionally sets both `refund_application_fee=true` and `reverse_transfer=true` for destination charges. This returns the proportional application fee and reverses the connected-account transfer. Webhooks—not the API response—finalize refund state. Partial refunds are capped at the original authoritative payment amount; disputes retain open/won/lost Stripe state.

## Deployment

1. Apply Supabase migrations through `20260922000000_harden_league_connect_accounting.sql`.
2. Deploy the web application with the matching Stripe key and webhook secret for that environment.
3. Subscribe the webhook to Checkout completion/expiration, PaymentIntent processing/success/failure/cancelation, charge refunds, and dispute creation/closure.
4. Complete or refresh Connect onboarding from the mobile API, then confirm `charges_enabled`, `payouts_enabled`, and `livemode` before accepting payment.

## Test-mode evidence requirements

The real lifecycle suite is `tests/stripe-test-mode-integration.spec.ts`. It deliberately skips unless an isolated test Stripe account, test Supabase project, test bearer tokens, reachable test deployment, and seeded fixture JSON are supplied through its documented `E2E_*` variables. Never point this suite at live credentials. It records Checkout/PaymentIntent/charge IDs and verifies signed webhooks, ledgers, receipts, fulfillment, duplicate delivery, decline, expiration, recipient rejection, and partial/full/failed refunds.

The current local environment has a live Stripe key and none of the isolated `E2E_*` inputs, so no real charges, refunds, expirations, or disputes were created during this audit.
