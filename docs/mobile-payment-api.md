# Mobile payment API

All endpoints accept `Authorization: Bearer <Supabase access token>`. Organization operations also accept `X-Workspace-Id`; otherwise the server resolves the user's active workspace. Browser-cookie sessions remain supported.

Money is always integer cents, currency is lowercase `usd`, and timestamps are ISO 8601 UTC. Clients never send organization IDs, connected-account IDs, fee rates, platform fees, Stripe fees, or net values as authoritative inputs.

Every intent request requires a stable `idempotency_key` (8–200 characters). A successful intent response is:

```json
{
  "transaction_id": "uuid",
  "status": "pending",
  "currency": "usd",
  "transaction_type": "registration",
  "amount_cents": 10000,
  "platform_fee_cents": 400,
  "stripe_processing_fee_cents": 320,
  "net_cents": 9600,
  "processing_fee_rate": "0.04",
  "client_secret": "pi_..._secret_..."
}
```

`net_cents` is the connected-account amount after the Coaches Hive application fee. Stripe processing fees are separately estimated/reported and are not subtracted twice. Stripe webhooks are authoritative for success, failure, refunds, subscription invoices, and Connect status.

## Routes

- `GET /api/mobile/capabilities?workspace_id=<uuid>&org_id=<uuid>` returns the server-resolved portal capability document. Prefer `X-Workspace-Id`; `org_id` is a compatibility fallback and is authorized against an active organization membership.
- `GET|POST /api/mobile/registrations`
- `GET /api/mobile/registrations/:id`
- `POST /api/mobile/registrations/:id/submit`
- `POST /api/mobile/registrations/:id/intent`
- `GET|POST /api/mobile/org/dues`
- `POST /api/mobile/dues/:installmentId/intent`
- `POST /api/mobile/dues/:installmentId/autopay`
- `POST /api/mobile/dues/:installmentId/waive`
- `POST /api/mobile/dues/:installmentId/mark-off-platform`
- `GET|POST /api/mobile/org/payment-events`
- `POST /api/mobile/events/:obligationId/intent`
- `GET|POST /api/mobile/facilities`
- `POST /api/mobile/facilities/:spaceId/intent`
- `POST /api/mobile/facility-bookings/:bookingId/cancel`
- `GET|POST /api/mobile/org/fundraising`
- `POST /api/mobile/fundraising/:campaignId/intent`
- `GET /api/mobile/payments/dashboard?scope=organization|coach|parent`

Registration intent requests include `submission_id`. Event intent requests include the desired partial `amount_cents`. Facility intent requests include `starts_at` and `ends_at`; rates and availability are resolved on the server. Fundraising intent requests include contributor presentation fields, but the server resolves the campaign, recipient, and fee.

Organization-scoped registration and facility collection requests may use `scope=organization` when the app has not yet persisted an active workspace header. The server still resolves and authorizes the organization; clients never choose an `org_id` for writes.

## Transaction mapping

Registration, dues, event, facility, fundraising, and equipment map directly to ledger types. Private training temporarily uses `other` with a coach-session `source_record_type`. Travel remains reserved. Insurance/compliance uses `other` with an insurance/compliance source until a coordinated ledger change is released.
