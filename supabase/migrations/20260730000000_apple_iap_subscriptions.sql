alter table public.platform_subscriptions
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_latest_transaction_id text,
  add column if not exists apple_product_id text,
  add column if not exists apple_environment text;

create unique index if not exists platform_subscriptions_apple_original_transaction_uidx
  on public.platform_subscriptions(apple_original_transaction_id)
  where apple_original_transaction_id is not null;

create table if not exists public.apple_iap_subscriptions (
  original_transaction_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  owner_type text not null check (owner_type in ('coach', 'athlete')),
  owner_id uuid not null,
  plan_key text not null check (plan_key in ('coach_all_access', 'family_all_access')),
  product_id text not null,
  latest_transaction_id text not null unique,
  environment text not null check (environment in ('Production', 'Sandbox')),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  expires_at timestamptz,
  revoked_at timestamptz,
  cancel_at_period_end boolean not null default false,
  last_signed_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apple_iap_subscriptions_user_idx
  on public.apple_iap_subscriptions(user_id);

alter table public.apple_iap_subscriptions enable row level security;
drop policy if exists "users read own apple subscriptions" on public.apple_iap_subscriptions;
create policy "users read own apple subscriptions"
on public.apple_iap_subscriptions for select
using (user_id = auth.uid());

create table if not exists public.app_store_server_notifications (
  notification_uuid text primary key,
  notification_type text,
  subtype text,
  environment text,
  original_transaction_id text,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'ignored', 'failed')),
  signed_date timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.app_store_server_notifications enable row level security;
revoke all on public.apple_iap_subscriptions from anon, authenticated;
grant select on public.apple_iap_subscriptions to authenticated;
revoke all on public.app_store_server_notifications from anon, authenticated;
