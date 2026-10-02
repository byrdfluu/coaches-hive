-- Restore the columns required by the webhook-authoritative Stripe Connect
-- accounting writer. This is intentionally idempotent because some
-- environments received only part of the earlier league accounting migration.

alter table public.stripe_connect_payment_accounting
  add column if not exists recipient_net_amount_cents bigint,
  add column if not exists stripe_charge_id text;

alter table public.stripe_connect_payment_accounting
  drop constraint if exists stripe_connect_payment_accounting_recipient_net_nonnegative;
alter table public.stripe_connect_payment_accounting
  add constraint stripe_connect_payment_accounting_recipient_net_nonnegative
  check (recipient_net_amount_cents is null or recipient_net_amount_cents >= 0);

create index if not exists stripe_connect_accounting_charge_idx
  on public.stripe_connect_payment_accounting(stripe_charge_id)
  where stripe_charge_id is not null;

-- Do not mutate stripe_webhook_events here. Some installations attach an
-- operations-notification trigger to failed events, and schema deployment must
-- not depend on that optional notification function's signature. The webhook
-- handler already treats processing events older than five minutes as stale
-- and safely replays them using the Stripe event ID and PaymentIntent unique
-- constraints.

notify pgrst, 'reload schema';
