-- Coaches Hive All Access billing. Safe to rerun.
alter table if exists public.platform_subscriptions
  drop constraint if exists platform_subscriptions_owner_type_check;

alter table if exists public.platform_subscriptions
  add constraint platform_subscriptions_owner_type_check
  check (owner_type in ('coach', 'athlete', 'org'));

alter table if exists public.platform_subscriptions
  add column if not exists billing_interval text
    check (billing_interval in ('month', 'year')),
  add column if not exists stripe_price_id text,
  add column if not exists stripe_subscription_item_id text,
  add column if not exists stripe_coach_seat_item_id text,
  add column if not exists included_coach_quantity integer not null default 0,
  add column if not exists billable_coach_quantity integer not null default 0,
  add column if not exists renewal_amount_cents integer,
  add column if not exists currency text not null default 'usd';

create table if not exists public.org_coach_billing_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.platform_subscriptions(id) on delete set null,
  active_coach_count integer not null default 0,
  included_coach_count integer not null default 1,
  additional_coach_count integer not null default 0,
  coach_ids uuid[] not null default '{}',
  reasons jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists org_coach_billing_snapshots_org_captured_idx
  on public.org_coach_billing_snapshots(org_id, captured_at desc);

alter table public.org_coach_billing_snapshots enable row level security;
drop policy if exists "org members read coach billing snapshots" on public.org_coach_billing_snapshots;
create policy "org members read coach billing snapshots"
on public.org_coach_billing_snapshots for select using (
  exists (
    select 1 from public.organization_memberships om
    where om.org_id = org_coach_billing_snapshots.org_id
      and om.user_id = auth.uid()
      and (om.status is null or om.status = 'active')
  )
);

create table if not exists public.family_subscription_athletes (
  id uuid primary key default gen_random_uuid(),
  subscription_owner_id uuid not null references public.profiles(id) on delete cascade,
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(athlete_profile_id),
  unique(subscription_owner_id, athlete_profile_id)
);

create index if not exists family_subscription_athletes_owner_idx
  on public.family_subscription_athletes(subscription_owner_id);

alter table public.family_subscription_athletes enable row level security;
drop policy if exists "families manage covered athletes" on public.family_subscription_athletes;
create policy "families manage covered athletes"
on public.family_subscription_athletes for all
using (subscription_owner_id = auth.uid())
with check (
  subscription_owner_id = auth.uid()
  and (
    select count(*) from public.family_subscription_athletes fsa
    where fsa.subscription_owner_id = auth.uid()
  ) < 4
);
