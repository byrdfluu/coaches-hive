create table if not exists public.organization_recurring_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid references public.business_workspaces(id) on delete set null,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  payer_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  amount_cents bigint not null check(amount_cents > 0),
  currency text not null default 'usd',
  interval text not null check(interval in ('month','year')),
  description text not null,
  start_date date not null,
  platform_fee_bps integer not null default 400 check(platform_fee_bps = 400),
  status text not null default 'checkout_pending',
  payment_method_status text,
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  stripe_connected_account_id text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  paused_at timestamptz,
  last_event_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organization_recurring_fees_payer_idx on public.organization_recurring_fees(payer_user_id,created_at desc);
create index if not exists organization_recurring_fees_org_idx on public.organization_recurring_fees(organization_id,created_at desc);

create table if not exists public.organization_recurring_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  recurring_fee_id uuid not null references public.organization_recurring_fees(id) on delete cascade,
  stripe_invoice_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_dispute_id text,
  amount_due_cents bigint not null default 0,
  amount_paid_cents bigint not null default 0,
  refunded_amount_cents bigint not null default 0,
  currency text not null default 'usd',
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organization_recurring_fee_invoices_fee_idx on public.organization_recurring_fee_invoices(recurring_fee_id,created_at desc);

alter table public.organization_recurring_fees enable row level security;
alter table public.organization_recurring_fee_invoices enable row level security;
revoke all on public.organization_recurring_fees,public.organization_recurring_fee_invoices from anon;
grant select on public.organization_recurring_fees,public.organization_recurring_fee_invoices to authenticated;

drop policy if exists recurring_fees_authorized_read on public.organization_recurring_fees;
create policy recurring_fees_authorized_read on public.organization_recurring_fees for select to authenticated using (
  payer_user_id=auth.uid() or public.is_org_director(organization_id) or public.is_superadmin(auth.uid())
);
drop policy if exists recurring_fee_invoices_authorized_read on public.organization_recurring_fee_invoices;
create policy recurring_fee_invoices_authorized_read on public.organization_recurring_fee_invoices for select to authenticated using (
  exists(select 1 from public.organization_recurring_fees f where f.id=recurring_fee_id and
    (f.payer_user_id=auth.uid() or public.is_org_director(f.organization_id) or public.is_superadmin(auth.uid())))
);

do $$ begin
  alter publication supabase_realtime add table public.organization_recurring_fees;
exception when duplicate_object then null; end $$;
