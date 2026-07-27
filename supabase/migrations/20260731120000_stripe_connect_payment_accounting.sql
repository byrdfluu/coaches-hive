-- Durable, webhook-authoritative accounting for Stripe Connect payments.

create table if not exists public.stripe_connect_payment_accounting (
  id uuid primary key default gen_random_uuid(),
  stripe_payment_intent_id text not null unique,
  stripe_checkout_session_id text,
  checkout_type text not null,
  payment_record_id uuid,
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  platform_fee_cents bigint not null check (platform_fee_cents >= 0),
  platform_fee_rate numeric(8,4) not null check (platform_fee_rate >= 0),
  connected_account_destination text not null,
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  currency text not null default 'usd',
  livemode boolean not null default false,
  stripe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_connect_payment_accounting_checkout_idx
  on public.stripe_connect_payment_accounting(stripe_checkout_session_id);
create index if not exists stripe_connect_payment_accounting_record_idx
  on public.stripe_connect_payment_accounting(checkout_type, payment_record_id);
create index if not exists stripe_connect_payment_accounting_created_idx
  on public.stripe_connect_payment_accounting(created_at desc);

alter table public.stripe_connect_payment_accounting enable row level security;

drop policy if exists "superadmins read connect payment accounting"
  on public.stripe_connect_payment_accounting;
create policy "superadmins read connect payment accounting"
on public.stripe_connect_payment_accounting
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  )
);

revoke all on table public.stripe_connect_payment_accounting from public, anon, authenticated;
grant select on table public.stripe_connect_payment_accounting to authenticated;
grant all on table public.stripe_connect_payment_accounting to service_role;
