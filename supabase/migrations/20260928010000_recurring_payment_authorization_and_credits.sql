-- Explicit recurring authorization, customer-facing terms, and idempotent cycle credits.
alter table public.organization_recurring_fee_offers
  add column if not exists cancellation_terms text,
  add column if not exists refund_terms text,
  add column if not exists end_date date,
  add column if not exists payment_count integer check(payment_count is null or payment_count > 0),
  add column if not exists benefits jsonb not null default '{}'::jsonb;

alter table public.organization_recurring_fees
  add column if not exists authorization_accepted_at timestamptz,
  add column if not exists authorization_user_agent text,
  add column if not exists authorization_ip_hash text,
  add column if not exists authorization_text text,
  add column if not exists authorization_version text;

alter table public.organization_recurring_fee_invoices alter column stripe_invoice_id drop not null;

create table if not exists public.organization_recurring_fee_credit_grants (
  id uuid primary key default gen_random_uuid(),
  recurring_fee_id uuid not null references public.organization_recurring_fees(id) on delete cascade,
  invoice_id uuid not null references public.organization_recurring_fee_invoices(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  group_credits integer not null default 0 check(group_credits >= 0),
  one_on_one_credits integer not null default 0 check(one_on_one_credits >= 0),
  granted_at timestamptz not null default now(),
  unique(recurring_fee_id,invoice_id)
);
create index if not exists recurring_credit_grants_athlete_idx
  on public.organization_recurring_fee_credit_grants(athlete_id,granted_at desc);
alter table public.organization_recurring_fee_credit_grants enable row level security;
revoke all on public.organization_recurring_fee_credit_grants from anon,authenticated;
grant select on public.organization_recurring_fee_credit_grants to authenticated;
create policy recurring_credit_grants_authorized_read on public.organization_recurring_fee_credit_grants
for select to authenticated using (
  exists(select 1 from public.organization_recurring_fees f where f.id=recurring_fee_id and
    (f.payer_user_id=auth.uid() or public.is_org_director(f.organization_id) or public.is_superadmin(auth.uid())))
);
