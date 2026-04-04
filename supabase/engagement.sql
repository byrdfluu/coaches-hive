-- Practice plans for coaches + teams + athletes
create table if not exists public.practice_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  team_id uuid references public.org_teams(id) on delete set null,
  athlete_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  session_date date,
  duration_minutes integer,
  drills jsonb,
  visibility text not null default 'private' check (visibility in ('private', 'team', 'athlete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practice_plans_coach_id_idx on public.practice_plans(coach_id);
create index if not exists practice_plans_team_id_idx on public.practice_plans(team_id);
create index if not exists practice_plans_athlete_id_idx on public.practice_plans(athlete_id);

alter table public.practice_plans enable row level security;

create policy "practice_plans select" on public.practice_plans
  for select
  using (
    coach_id = auth.uid()
    or athlete_id = auth.uid()
    or exists (
      select 1
      from public.organization_memberships m
      join public.org_teams t on t.org_id = m.org_id
      where t.id = practice_plans.team_id
        and m.user_id = auth.uid()
    )
  );

create policy "practice_plans insert" on public.practice_plans
  for insert
  with check (coach_id = auth.uid() or public.is_admin());

create policy "practice_plans update" on public.practice_plans
  for update
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

create policy "practice_plans delete" on public.practice_plans
  for delete
  using (coach_id = auth.uid() or public.is_admin());

-- Practice plan attachments
create table if not exists public.practice_plan_attachments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.practice_plans(id) on delete cascade,
  file_url text not null,
  file_path text,
  file_name text,
  file_type text,
  file_size integer,
  created_at timestamptz not null default now()
);

create index if not exists practice_plan_attachments_plan_id_idx on public.practice_plan_attachments(plan_id);

alter table public.practice_plan_attachments enable row level security;

create policy "practice_plan_attachments select" on public.practice_plan_attachments
  for select
  using (
    exists (
      select 1
      from public.practice_plans p
      where p.id = practice_plan_attachments.plan_id
        and (
          p.coach_id = auth.uid()
          or p.athlete_id = auth.uid()
          or exists (
            select 1
            from public.organization_memberships m
            join public.org_teams t on t.org_id = m.org_id
            where t.id = p.team_id
              and m.user_id = auth.uid()
          )
        )
    )
  );

create policy "practice_plan_attachments insert" on public.practice_plan_attachments
  for insert
  with check (
    exists (
      select 1
      from public.practice_plans p
      where p.id = practice_plan_attachments.plan_id
        and (p.coach_id = auth.uid() or public.is_admin())
    )
  );

-- Emergency contacts (2 per athlete)
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  contact_index integer not null check (contact_index in (1, 2)),
  name text,
  relationship text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create unique index if not exists emergency_contacts_unique_idx on public.emergency_contacts(athlete_id, contact_index);

alter table public.emergency_contacts enable row level security;

create policy "emergency_contacts select" on public.emergency_contacts
  for select
  using (athlete_id = auth.uid() or public.is_admin());

create policy "emergency_contacts insert" on public.emergency_contacts
  for insert
  with check (athlete_id = auth.uid() or public.is_admin());

create policy "emergency_contacts update" on public.emergency_contacts
  for update
  using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

create policy "emergency_contacts delete" on public.emergency_contacts
  for delete
  using (athlete_id = auth.uid() or public.is_admin());

-- Dashboard layout preferences
create table if not exists public.dashboard_layouts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  page text not null,
  hidden_sections text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, page)
);

alter table public.dashboard_layouts enable row level security;

create policy "dashboard_layouts select" on public.dashboard_layouts
  for select
  using (user_id = auth.uid());

create policy "dashboard_layouts upsert" on public.dashboard_layouts
  for insert
  with check (user_id = auth.uid());

create policy "dashboard_layouts update" on public.dashboard_layouts
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Org invites + notifications
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  role text not null,
  invited_email text not null,
  invited_user_id uuid references public.profiles(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'awaiting_approval', 'approved', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists org_invites_org_id_idx on public.org_invites(org_id);
create index if not exists org_invites_email_idx on public.org_invites(invited_email);

alter table public.org_invites enable row level security;

create policy "org_invites select" on public.org_invites
  for select
  using (
    public.is_admin()
    or invited_user_id = auth.uid()
    or invited_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_invites.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

create policy "org_invites insert" on public.org_invites
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_invites.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );

create policy "org_invites update" on public.org_invites
  for update
  using (
    public.is_admin()
    or invited_user_id = auth.uid()
    or invited_email = coalesce(auth.jwt() ->> 'email', '')
  )
  with check (
    public.is_admin()
    or invited_user_id = auth.uid()
    or invited_email = coalesce(auth.jwt() ->> 'email', '')
  );

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  action_url text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);

alter table public.notifications enable row level security;

create policy "notifications select" on public.notifications
  for select
  using (user_id = auth.uid());

create policy "notifications insert" on public.notifications
  for insert
  with check (public.is_admin());

create policy "notifications update" on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Seasons + grade levels
alter table public.profiles
  add column if not exists athlete_season text;

alter table public.profiles
  add column if not exists athlete_grade_level text;

alter table public.profiles
  add column if not exists coach_seasons text[];

alter table public.profiles
  add column if not exists coach_grades text[];
