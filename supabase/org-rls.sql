-- Org settings + school roles RLS

-- org settings table
create table if not exists org_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  org_name text,
  primary_contact_email text,
  support_phone text,
  location text,
  cancellation_window text,
  reschedule_window text,
  policy_notes text,
  billing_contact text,
  invoice_frequency text,
  tax_id text,
  billing_address text,
  guardian_consent text,
  eligibility_tracking text,
  medical_clearance text,
  communication_limits text,
  season_start date,
  season_end date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- update role constraint on org memberships
alter table organization_memberships
  drop constraint if exists organization_memberships_role_check;

alter table organization_memberships
  add constraint organization_memberships_role_check
  check (role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','coach','assistant_coach','athlete'));

-- RLS: org_settings
alter table org_settings enable row level security;

-- organization_memberships RLS
alter table organization_memberships enable row level security;

drop policy if exists "org membership read" on organization_memberships;
create policy "org membership read" on organization_memberships
for select using (
  user_id = auth.uid()
  or (auth.jwt() ->> 'role') = 'admin'
  or exists (
    select 1 from organization_memberships m
    where m.org_id = organization_memberships.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);

create policy "org settings read" on org_settings
for select using (
  exists (
    select 1
    from organization_memberships m
    where m.org_id = org_settings.org_id
      and m.user_id = auth.uid()
  )
);

create policy "org settings manage" on org_settings
for insert with check (
  exists (
    select 1
    from organization_memberships m
    where m.org_id = org_settings.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director')
  )
);

create policy "org settings update" on org_settings
for update using (
  exists (
    select 1
    from organization_memberships m
    where m.org_id = org_settings.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director')
  )
);

-- Update team and membership policies to include school roles

drop policy if exists "org membership manage" on organization_memberships;
create policy "org membership manage" on organization_memberships
for insert with check (
  exists (
    select 1 from organization_memberships m
    where m.org_id = organization_memberships.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','program_director')
  )
);

drop policy if exists "org membership update" on organization_memberships;
create policy "org membership update" on organization_memberships
for update using (
  exists (
    select 1 from organization_memberships m
    where m.org_id = organization_memberships.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','program_director')
  )
);

drop policy if exists "org membership delete" on organization_memberships;
create policy "org membership delete" on organization_memberships
for delete using (
  exists (
    select 1 from organization_memberships m
    where m.org_id = organization_memberships.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','program_director')
  )
);

drop policy if exists "org teams manage" on org_teams;
create policy "org teams manage" on org_teams
for insert with check (
  exists (
    select 1 from organization_memberships m
    where m.org_id = org_teams.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);

drop policy if exists "org teams update" on org_teams;
create policy "org teams update" on org_teams
for update using (
  exists (
    select 1 from organization_memberships m
    where m.org_id = org_teams.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);

drop policy if exists "org teams delete" on org_teams;
create policy "org teams delete" on org_teams
for delete using (
  exists (
    select 1 from organization_memberships m
    where m.org_id = org_teams.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);

alter table org_teams enable row level security;

drop policy if exists "org teams read" on org_teams;
create policy "org teams read" on org_teams
for select using (
  (auth.jwt() ->> 'role') = 'admin'
  or exists (
    select 1 from organization_memberships m
    where m.org_id = org_teams.org_id
      and m.user_id = auth.uid()
  )
);

-- org team members table
create table if not exists org_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references org_teams(id) on delete cascade,
  athlete_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

alter table org_team_members enable row level security;

drop policy if exists "org team members read" on org_team_members;
create policy "org team members read" on org_team_members
for select using (
  exists (
    select 1
    from org_teams t
    join organization_memberships m on m.org_id = t.org_id
    where t.id = org_team_members.team_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "org team members manage" on org_team_members;
create policy "org team members manage" on org_team_members
for insert with check (
  exists (
    select 1
    from org_teams t
    join organization_memberships m on m.org_id = t.org_id
    where t.id = org_team_members.team_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);

drop policy if exists "org team members update" on org_team_members;
create policy "org team members update" on org_team_members
for update using (
  exists (
    select 1
    from org_teams t
    join organization_memberships m on m.org_id = t.org_id
    where t.id = org_team_members.team_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);

drop policy if exists "org team members delete" on org_team_members;
create policy "org team members delete" on org_team_members
for delete using (
  exists (
    select 1
    from org_teams t
    join organization_memberships m on m.org_id = t.org_id
    where t.id = org_team_members.team_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  )
);
