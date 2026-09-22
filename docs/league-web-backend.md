# League web/backend deployment

## Mobile contract

- Public deep link: `https://coacheshive.com/leagues/<league UUID>`
- Connect: `POST /api/mobile/connect/start` with `role`, `league_id`, `return_url`, and optional `workspace_id`; response contains `onboarding_url`.
- Checkout: current iOS builds send `type=league_fee`, `record_id=<assignment UUID>`, and `idempotency_key`. The backend also accepts `assignment_id` as a compatibility alias.
- Checkout response: `checkout_url` and `expires_at`.
- Payment completion: `coacheshive://payment-complete?type=league_fee&id=<assignment UUID>&status=processing`.

No mobile contract change is required.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL=https://coacheshive.com`

Use the existing production values. Never expose the service-role or Stripe secret keys through `NEXT_PUBLIC_*` variables.

## Deployment

1. Apply `supabase/migrations/20260921039000_league_web_payment_and_public_contract.sql` after the league foundation and permission migrations.
2. Confirm `stripe_connect_accounts` accepts `owner_type=league` and has a unique league account.
3. Deploy the web application.
4. In Stripe, ensure the production webhook sends at least `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and `charge.dispute.*` to `/api/stripe/webhook`.
5. Confirm the configured webhook signing secret matches `STRIPE_WEBHOOK_SECRET`.
6. Confirm league administrators and finance managers have `manage_payments` where applicable.

## End-to-end checklist

- Open a public league deep link while signed out; confirm only public league fields and aggregate counts appear.
- Open a private or inactive league UUID; confirm a 404 response.
- Sign in and submit organization, coach, athlete/parent, and other join requests.
- Confirm an organization request only accepts an organization administered by the requester.
- Confirm an athlete request only accepts an athlete profile managed by the requester.
- Review one request with a league registration administrator and verify its audit event.
- Attempt Connect onboarding as an unrelated user; confirm 403.
- Start and refresh Connect onboarding as a league admin or `manage_payments` user.
- Attempt to pay another family’s assignment and an unrelated organization assignment; confirm 403.
- Attempt checkout for paid, waived, refunded, and disputed assignments; confirm 409.
- Complete a test-mode league fee checkout; confirm the webhook—not the redirect—sets `paid_cents`, `status`, `paid_at`, and `provider_payment_id`.
- Replay the Stripe event; confirm no duplicate state change.
- Refund and dispute the test charge; confirm assignment status, audit history, and notifications update.
- Confirm the browser returns to the iOS `league_fee` payment-complete deep link.
