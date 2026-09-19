-- Payment security hardening: organization-authored recurring offers, immutable
-- checkout snapshots, durable idempotency, event ordering, and rate limiting.

create table if not exists public.organization_recurring_fee_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid references public.business_workspaces(id) on delete set null,
  description text not null check(length(trim(description)) between 1 and 160),
  amount_cents bigint not null check(amount_cents >= 50),
  currency text not null default 'usd' check(currency = 'usd'),
  interval text not null check(interval in ('month','year')),
  status text not null default 'draft' check(status in ('draft','published','inactive')),
  version integer not null default 1 check(version > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_recurring_fee_offer_assignments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.organization_recurring_fee_offers(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  status text not null default 'offered' check(status in ('offered','accepted','declined','revoked')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(offer_id,athlete_id)
);

alter table public.organization_recurring_fees
  add column if not exists offer_id uuid references public.organization_recurring_fee_offers(id) on delete restrict,
  add column if not exists offer_assignment_id uuid references public.organization_recurring_fee_offer_assignments(id) on delete restrict,
  add column if not exists idempotency_key text,
  add column if not exists immutable_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists last_stripe_event_created bigint not null default 0;
create unique index if not exists organization_recurring_fees_payer_idempotency_uidx
  on public.organization_recurring_fees(payer_user_id,idempotency_key) where idempotency_key is not null;

alter table public.organization_recurring_fee_invoices
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_payment_attempt timestamptz,
  add column if not exists last_stripe_event_created bigint not null default 0;

alter table public.org_settings
  add column if not exists recurring_fees_enabled boolean not null default true;

create table if not exists public.payment_security_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_security_events_window_idx
  on public.payment_security_events(user_id,action,created_at desc);

alter table public.organization_recurring_fee_offers enable row level security;
alter table public.organization_recurring_fee_offer_assignments enable row level security;
alter table public.payment_security_events enable row level security;
revoke all on public.organization_recurring_fee_offers, public.organization_recurring_fee_offer_assignments,
  public.payment_security_events from anon, authenticated;
grant select on public.organization_recurring_fee_offers, public.organization_recurring_fee_offer_assignments to authenticated;

create policy recurring_offer_authorized_read on public.organization_recurring_fee_offers
for select to authenticated using (
  public.is_org_director(organization_id) or public.is_superadmin(auth.uid()) or exists (
    select 1 from public.organization_recurring_fee_offer_assignments a
    join public.athlete_profiles p on p.id=a.athlete_id
    left join public.family_members fm on fm.family_id=p.family_id and fm.user_id=auth.uid() and fm.status='active'
    where a.offer_id=organization_recurring_fee_offers.id and (p.owner_user_id=auth.uid() or fm.user_id is not null)
  )
);
create policy recurring_offer_assignment_authorized_read on public.organization_recurring_fee_offer_assignments
for select to authenticated using (
  exists (select 1 from public.organization_recurring_fee_offers o where o.id=organization_recurring_fee_offer_assignments.offer_id and
    (public.is_org_director(o.organization_id) or public.is_superadmin(auth.uid()))) or
  exists (select 1 from public.athlete_profiles p left join public.family_members fm
    on fm.family_id=p.family_id and fm.user_id=auth.uid() and fm.status='active'
    where p.id=organization_recurring_fee_offer_assignments.athlete_id and (p.owner_user_id=auth.uid() or fm.user_id is not null))
);

do $$ begin
  alter publication supabase_realtime add table public.organization_recurring_fee_offers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.organization_recurring_fee_offer_assignments;
exception when duplicate_object then null; end $$;
