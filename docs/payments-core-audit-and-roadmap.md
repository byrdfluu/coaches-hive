# Payments core audit and delivery map

## Current foundation

- Organizations use Stripe Connect Express accounts. The org onboarding route creates or reuses an Express account and payment routes require charges, payouts, and details to be enabled.
- Org collections use destination PaymentIntents with `application_fee_amount`. The fee calculator reads the org's stored processing rate, with 4% as the default and 3% supported as an account-level exception.
- Stripe webhook events are persisted and deduplicated. Current handlers cover successful and failed PaymentIntents, invoice payments, refunds, Connect account updates, and payout events.
- Registrations/enrollment and tryouts already support shareable public forms and Connect payments. Organization charges support assignments, payment reminders, receipts, manual paid/waived states, and saved Stripe customer payment methods.
- Full and partial Stripe refunds already use idempotency keys and proportionally refund the Connect application fee when present.
- Facility-like marketplace checkout already has a separately configurable marketplace fee path. It must remain distinct from the org processing rate.

## Gaps found

- Financial records are split across receipts, org fee assignments, session payments, orders, and Connect accounting. Some legacy records store dollar decimals rather than integer cents.
- Enrollment lacked early/late pricing, bundle metadata, required-waiver attachment, payer/player links, pricing-source attribution, and payment-method display metadata.
- Public registration intent creation did not supply a Stripe idempotency key.
- Recurring org charges were modeled as one-time assignments. The existing subscription autopay endpoint manages platform subscriptions, not team-dues schedules.
- Games/calendar records are scheduling records and do not model an event collection balance, player split, or partial payments.
- No first-class fundraising campaign or contribution model existed.
- Automated retry timing and aging/reminder jobs need scheduled Vercel invocations after the underlying installment records and APIs are live.

## Delivery decisions

- `payment_transactions` is the unified, cents-based ledger for every new flow. Existing financial tables remain intact and can be backfilled in a separately verified migration.
- Stripe webhooks are authoritative for final payment state. Client confirmation endpoints may create pending/display records but must not be the only source of success.
- New payment endpoints must use a stable Stripe idempotency key and a database uniqueness constraint on the Stripe PaymentIntent ID.
- All stored timestamps are UTC `timestamptz`; all new monetary fields are integer cents.
- Parent/player IDs from public pages must be derived from an authenticated session or verified against the submitted account email. Never trust a public UUID by itself.

## Current sprint sequence

1. Registration: complete admin pricing/waiver UI, public waiver signing, webhook-authoritative fulfillment, roster enrollment, confirmation email, and real-time totals.
2. Dues: CRUD for schedules, installment generation, Stripe off-session charging, retry jobs at days 3/7/14, reminders, and collection dashboards.
3. Events: CRUD, roster split preview, share page, partial-payment checkout, deadline reminders, and balance dashboard.
4. Facilities: extend the existing marketplace/booking model with facility spaces and policy-driven cancellation. Preserve the configurable 10% fee capped at $75 rather than using the org's 4% rate.
5. Fundraising: campaign CRUD, public contribution checkout, progress totals, anonymous display, and tax-deductibility-aware receipts.

## Future schema only: equipment and apparel

Proposed entities:

- `equipment_catalogs(id, org_id, team_id, name, active, opens_at, closes_at)`
- `equipment_items(id, catalog_id, sku, name, description, unit_amount_cents, taxable, metadata)`
- `equipment_item_variants(id, item_id, label, size, color, inventory_quantity)`
- `equipment_orders(id, org_id, payer_id, player_id, status, subtotal_cents, tax_cents, total_cents, transaction_id, fulfillment_status)`
- `equipment_order_lines(id, order_id, variant_id, quantity, unit_amount_cents)`

When built, successful payments use `transaction_type = 'equipment'`. Inventory reservation and payment fulfillment must be idempotent and webhook-authoritative.

## Future schema only: travel deposits

Proposed entities:

- `travel_plans(id, org_id, team_id, name, starts_at, ends_at, destination, status)`
- `travel_cost_items(id, travel_plan_id, category, description, total_amount_cents, allocation_method)`
- `travel_payment_schedules(id, travel_plan_id, player_id, family_account_id, due_at, amount_cents, sequence_number)`
- `travel_payment_allocations(id, schedule_id, transaction_id, amount_cents)`

When built, collections use `transaction_type = 'travel'`, allow installments, and retain allocation detail so refunds can be applied to the correct hotel, transport, meal, or general deposit component.
