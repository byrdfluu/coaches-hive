create extension if not exists "pgcrypto";

create table if not exists public.coach_membership_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'usd',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  included_sessions integer not null default 0 check (included_sessions >= 0),
  member_only_access boolean not null default false,
  stripe_product_id text,
  stripe_price_id text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.coach_membership_plans(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text,
  status text not null default 'incomplete' check (
    status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused', 'expired')
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, athlete_id)
);

create table if not exists public.coach_membership_entitlements (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.coach_membership_subscriptions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('session_credit', 'member_access', 'discount')),
  quantity integer not null default 0 check (quantity >= 0),
  used_quantity integer not null default 0 check (used_quantity >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_membership_usage (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.coach_membership_entitlements(id) on delete cascade,
  subscription_id uuid not null references public.coach_membership_subscriptions(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  usage_type text not null default 'session_credit' check (usage_type in ('session_credit', 'manual_adjustment', 'refund_credit')),
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists coach_membership_plans_coach_idx
  on public.coach_membership_plans(coach_id);
create index if not exists coach_membership_subscriptions_coach_idx
  on public.coach_membership_subscriptions(coach_id);
create index if not exists coach_membership_subscriptions_athlete_idx
  on public.coach_membership_subscriptions(athlete_id);
create index if not exists coach_membership_subscriptions_status_idx
  on public.coach_membership_subscriptions(status);
create index if not exists coach_membership_entitlements_subscription_idx
  on public.coach_membership_entitlements(subscription_id);
create unique index if not exists coach_membership_entitlements_period_unique_idx
  on public.coach_membership_entitlements(subscription_id, entitlement_type, period_start);
create index if not exists coach_membership_usage_subscription_idx
  on public.coach_membership_usage(subscription_id);

alter table public.coach_membership_plans enable row level security;
alter table public.coach_membership_subscriptions enable row level security;
alter table public.coach_membership_entitlements enable row level security;
alter table public.coach_membership_usage enable row level security;

drop policy if exists "coach membership plans select" on public.coach_membership_plans;
create policy "coach membership plans select" on public.coach_membership_plans
  for select using (status = 'active' or coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership plans insert" on public.coach_membership_plans;
create policy "coach membership plans insert" on public.coach_membership_plans
  for insert with check (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership plans update" on public.coach_membership_plans;
create policy "coach membership plans update" on public.coach_membership_plans
  for update using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin')
  with check (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership subscriptions select" on public.coach_membership_subscriptions;
create policy "coach membership subscriptions select" on public.coach_membership_subscriptions
  for select using (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership subscriptions insert" on public.coach_membership_subscriptions;
create policy "coach membership subscriptions insert" on public.coach_membership_subscriptions
  for insert with check (athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership subscriptions update" on public.coach_membership_subscriptions;
create policy "coach membership subscriptions update" on public.coach_membership_subscriptions
  for update using (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership entitlements select" on public.coach_membership_entitlements;
create policy "coach membership entitlements select" on public.coach_membership_entitlements
  for select using (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership entitlements manage admin" on public.coach_membership_entitlements;
create policy "coach membership entitlements manage admin" on public.coach_membership_entitlements
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership usage select" on public.coach_membership_usage;
create policy "coach membership usage select" on public.coach_membership_usage
  for select using (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach membership usage manage admin" on public.coach_membership_usage;
create policy "coach membership usage manage admin" on public.coach_membership_usage
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');
