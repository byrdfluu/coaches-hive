create extension if not exists "pgcrypto";

create table if not exists public.platform_fee_rules (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('starter', 'pro', 'elite')),
  category text not null check (category in ('session', 'marketplace_digital', 'marketplace_physical')),
  percentage numeric(5, 2) not null check (percentage >= 0 and percentage <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists platform_fee_rules_active_unique
  on public.platform_fee_rules (tier, category)
  where active;

create table if not exists public.coach_plans (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('starter', 'pro', 'elite')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_fee_rules enable row level security;
alter table public.coach_plans enable row level security;

drop policy if exists "platform fee rules select" on public.platform_fee_rules;
create policy "platform fee rules select" on public.platform_fee_rules
  for select using (auth.uid() is not null);

drop policy if exists "platform fee rules manage" on public.platform_fee_rules;
create policy "platform fee rules manage" on public.platform_fee_rules
  for insert with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "platform fee rules update" on public.platform_fee_rules;
create policy "platform fee rules update" on public.platform_fee_rules
  for update using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "platform fee rules delete" on public.platform_fee_rules;
create policy "platform fee rules delete" on public.platform_fee_rules
  for delete using ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach plans select" on public.coach_plans;
create policy "coach plans select" on public.coach_plans
  for select using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach plans insert" on public.coach_plans;
create policy "coach plans insert" on public.coach_plans
  for insert with check (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach plans update" on public.coach_plans;
create policy "coach plans update" on public.coach_plans
  for update using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin')
  with check (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

alter table if exists public.sessions
  add column if not exists price numeric,
  add column if not exists price_cents integer;

insert into public.platform_fee_rules (tier, category, percentage, active)
values
  ('starter', 'session', 16, true),
  ('pro', 'session', 13, true),
  ('elite', 'session', 10, true),
  ('starter', 'marketplace_digital', 10, true),
  ('pro', 'marketplace_digital', 11, true),
  ('elite', 'marketplace_digital', 10, true),
  ('starter', 'marketplace_physical', 10, true),
  ('pro', 'marketplace_physical', 11, true),
  ('elite', 'marketplace_physical', 10, true)
on conflict do nothing;

update public.platform_fee_rules
set percentage = 11
where active = true
  and tier = 'pro'
  and category in ('marketplace_digital', 'marketplace_physical')
  and percentage = 10;
