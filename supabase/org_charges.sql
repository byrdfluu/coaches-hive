-- Org dues & fee assignments

create table if not exists public.org_fees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  amount_cents integer not null,
  due_date date,
  audience_type text not null default 'all',
  team_id uuid references public.org_teams(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists org_fees_org_idx on public.org_fees(org_id);

create table if not exists public.org_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  fee_id uuid not null references public.org_fees(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'unpaid',
  paid_at timestamptz,
  payment_intent_id text,
  created_at timestamptz not null default now()
);

create index if not exists org_fee_assignments_fee_idx on public.org_fee_assignments(fee_id);
create index if not exists org_fee_assignments_athlete_idx on public.org_fee_assignments(athlete_id);

alter table public.org_fees enable row level security;
alter table public.org_fee_assignments enable row level security;

alter table public.org_fees
  drop constraint if exists org_fees_audience_check;

alter table public.org_fees
  add constraint org_fees_audience_check
  check (audience_type in ('all','team','athlete','coach'));

alter table public.org_fee_assignments
  drop constraint if exists org_fee_assignments_status_check;

alter table public.org_fee_assignments
  add constraint org_fee_assignments_status_check
  check (status in ('unpaid','paid','waived'));

alter table public.org_settings
  add column if not exists stripe_account_id text;

-- Org fees: org admins can manage, org members can read
drop policy if exists "org fees read" on public.org_fees;
create policy "org fees read" on public.org_fees
  for select using (
    exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_fees.org_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "org fees manage" on public.org_fees;
create policy "org fees manage" on public.org_fees
  for insert with check (
    exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_fees.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

drop policy if exists "org fees update" on public.org_fees;
create policy "org fees update" on public.org_fees
  for update using (
    exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_fees.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

-- Fee assignments: athletes can read their own, org admins can read/manage
drop policy if exists "org fee assignments read" on public.org_fee_assignments;
create policy "org fee assignments read" on public.org_fee_assignments
  for select using (
    athlete_id = auth.uid()
    or exists (
      select 1
      from public.org_fees f
      join public.organization_memberships m on m.org_id = f.org_id
      where f.id = org_fee_assignments.fee_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

drop policy if exists "org fee assignments manage" on public.org_fee_assignments;
create policy "org fee assignments manage" on public.org_fee_assignments
  for insert with check (
    exists (
      select 1
      from public.org_fees f
      join public.organization_memberships m on m.org_id = f.org_id
      where f.id = org_fee_assignments.fee_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

drop policy if exists "org fee assignments update" on public.org_fee_assignments;
create policy "org fee assignments update" on public.org_fee_assignments
  for update using (
    athlete_id = auth.uid()
    or exists (
      select 1
      from public.org_fees f
      join public.organization_memberships m on m.org_id = f.org_id
      where f.id = org_fee_assignments.fee_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  )
  with check (
    athlete_id = auth.uid()
    or exists (
      select 1
      from public.org_fees f
      join public.organization_memberships m on m.org_id = f.org_id
      where f.id = org_fee_assignments.fee_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );
