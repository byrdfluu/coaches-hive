-- Coach-owned waiver templates and direct athlete assignments.
create table if not exists coach_waivers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_waivers_coach_id_idx on coach_waivers(coach_id);
create index if not exists coach_waivers_active_idx on coach_waivers(coach_id, is_active);

create table if not exists coach_waiver_assignments (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid not null references coach_waivers(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  signed_at timestamptz,
  full_name text,
  ip_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waiver_id, athlete_id)
);

create index if not exists coach_waiver_assignments_waiver_id_idx on coach_waiver_assignments(waiver_id);
create index if not exists coach_waiver_assignments_coach_id_idx on coach_waiver_assignments(coach_id);
create index if not exists coach_waiver_assignments_athlete_id_idx on coach_waiver_assignments(athlete_id);
create index if not exists coach_waiver_assignments_status_idx on coach_waiver_assignments(coach_id, status);

alter table coach_waivers enable row level security;
alter table coach_waiver_assignments enable row level security;

create policy "coach_waivers_own_select" on coach_waivers
  for select using (coach_id = auth.uid());

create policy "coach_waivers_own_insert" on coach_waivers
  for insert with check (coach_id = auth.uid());

create policy "coach_waivers_own_update" on coach_waivers
  for update using (coach_id = auth.uid());

create policy "coach_waiver_assignments_coach_select" on coach_waiver_assignments
  for select using (coach_id = auth.uid());

create policy "coach_waiver_assignments_coach_insert" on coach_waiver_assignments
  for insert with check (coach_id = auth.uid());

create policy "coach_waiver_assignments_coach_update" on coach_waiver_assignments
  for update using (coach_id = auth.uid());

create policy "coach_waiver_assignments_athlete_select" on coach_waiver_assignments
  for select using (athlete_id = auth.uid());

create policy "coach_waiver_assignments_athlete_update" on coach_waiver_assignments
  for update using (athlete_id = auth.uid());
