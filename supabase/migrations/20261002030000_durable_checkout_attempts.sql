-- One durable, queryable record for each client checkout attempt. Offering and
-- registration tables remain authoritative for fulfillment; this table is the
-- boundary used for idempotency, expiry diagnostics, and reconciliation.
create table if not exists public.checkout_purchase_attempts (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  athlete_profile_id uuid,
  workspace_id uuid references public.business_workspaces(id) on delete set null,
  organization_id uuid,
  offering_type text,
  offering_id uuid,
  checkout_type text not null,
  billing_type text,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'usd',
  purchase_id text not null,
  checkout_record_id text not null,
  stripe_checkout_session_id text,
  idempotency_key text not null,
  request_id text not null,
  expires_at timestamptz,
  status text not null default 'processing'
    check (status in ('processing','checkout_pending','expired','completed','failed','canceled')),
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (buyer_user_id, checkout_type, idempotency_key)
);

create unique index if not exists checkout_purchase_attempts_stripe_session_uidx
  on public.checkout_purchase_attempts(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists checkout_purchase_attempts_reconcile_idx
  on public.checkout_purchase_attempts(status, expires_at)
  where status in ('processing','checkout_pending');
create index if not exists checkout_purchase_attempts_record_idx
  on public.checkout_purchase_attempts(checkout_type, checkout_record_id, created_at desc);

alter table public.checkout_purchase_attempts enable row level security;
revoke all on public.checkout_purchase_attempts from anon, authenticated;

comment on table public.checkout_purchase_attempts is
  'Durable idempotency and reconciliation ledger for Stripe Checkout creation; not the fulfillment source of truth.';

notify pgrst, 'reload schema';
