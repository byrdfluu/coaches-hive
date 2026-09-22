-- Complete the durable league fee settlement and Connect accounting contract.

alter table public.stripe_connect_accounts
  add column if not exists livemode boolean not null default false;

alter table public.league_fee_assignments
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists receipt_url text,
  add column if not exists currency text not null default 'usd',
  add column if not exists livemode boolean not null default false,
  add column if not exists refunded_cents bigint not null default 0,
  add column if not exists dispute_status text;

alter table public.league_fee_assignments
  drop constraint if exists league_fee_assignments_status_check;
alter table public.league_fee_assignments
  add constraint league_fee_assignments_status_check
  check(status in ('unpaid','processing','partial','paid','waived','refunded','disputed'));

alter table public.stripe_connect_payment_accounting
  add column if not exists stripe_processing_fee_cents bigint
    check(stripe_processing_fee_cents is null or stripe_processing_fee_cents >= 0),
  add column if not exists recipient_net_amount_cents bigint
    check(recipient_net_amount_cents is null or recipient_net_amount_cents >= 0),
  add column if not exists stripe_charge_id text;
