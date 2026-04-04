create table if not exists public.org_team_coaches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.org_teams(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'coach',
  created_at timestamptz not null default now(),
  unique (team_id, coach_id)
);

create index if not exists org_team_coaches_team_idx on public.org_team_coaches(team_id);
create index if not exists org_team_coaches_coach_idx on public.org_team_coaches(coach_id);

alter table public.org_team_coaches enable row level security;

drop policy if exists "org team coaches read" on public.org_team_coaches;
create policy "org team coaches read" on public.org_team_coaches
  for select using (
    exists (
      select 1
      from public.org_teams t
      join public.organization_memberships m on m.org_id = t.org_id
      where t.id = org_team_coaches.team_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "org team coaches manage" on public.org_team_coaches;
create policy "org team coaches manage" on public.org_team_coaches
  for insert with check (
    exists (
      select 1
      from public.org_teams t
      join public.organization_memberships m on m.org_id = t.org_id
      where t.id = org_team_coaches.team_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

drop policy if exists "org team coaches update" on public.org_team_coaches;
create policy "org team coaches update" on public.org_team_coaches
  for update using (
    exists (
      select 1
      from public.org_teams t
      join public.organization_memberships m on m.org_id = t.org_id
      where t.id = org_team_coaches.team_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.org_teams t
      join public.organization_memberships m on m.org_id = t.org_id
      where t.id = org_team_coaches.team_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

drop policy if exists "org team coaches delete" on public.org_team_coaches;
create policy "org team coaches delete" on public.org_team_coaches
  for delete using (
    exists (
      select 1
      from public.org_teams t
      join public.organization_memberships m on m.org_id = t.org_id
      where t.id = org_team_coaches.team_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );
