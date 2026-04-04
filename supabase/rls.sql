-- Membership table to link coaches and athletes
create table if not exists public.coach_athlete_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

create index if not exists coach_athlete_links_coach_idx on public.coach_athlete_links(coach_id);
create index if not exists coach_athlete_links_athlete_idx on public.coach_athlete_links(athlete_id);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.coach_athlete_links enable row level security;
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;
alter table public.message_attachments enable row level security;

-- Helper predicates
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin';
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'coach';
$$;

create or replace function public.is_athlete()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'athlete';
$$;

-- Profiles: self + linked coach/athlete + admin
create policy "profiles self" on public.profiles
  for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles linked" on public.profiles
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.coach_athlete_links l
      where (l.coach_id = auth.uid() and l.athlete_id = profiles.id)
         or (l.athlete_id = auth.uid() and l.coach_id = profiles.id)
    )
  );

create policy "profiles org staff" on public.profiles
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships member
        on member.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('org_admin','school_admin','athletic_director','team_manager','coach','assistant_coach')
        and member.user_id = profiles.id
    )
  );

create policy "profiles thread participants" on public.profiles
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.thread_participants tp
      join public.thread_participants tp_self
        on tp.thread_id = tp_self.thread_id
      where tp.user_id = profiles.id
        and tp_self.user_id = auth.uid()
    )
  );

create policy "profiles update self" on public.profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "profiles insert self" on public.profiles
  for insert
  with check (id = auth.uid() or public.is_admin());

-- Memberships
create policy "links select" on public.coach_athlete_links
  for select
  using (coach_id = auth.uid() or athlete_id = auth.uid() or public.is_admin());

create policy "links insert" on public.coach_athlete_links
  for insert
  with check (coach_id = auth.uid() or public.is_admin());

create policy "links update" on public.coach_athlete_links
  for update
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

-- Sessions
create policy "sessions select" on public.sessions
  for select
  using (coach_id = auth.uid() or athlete_id = auth.uid() or public.is_admin());

create policy "sessions insert" on public.sessions
  for insert
  with check (coach_id = auth.uid() or athlete_id = auth.uid() or public.is_admin());

create policy "sessions update" on public.sessions
  for update
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

create policy "sessions delete" on public.sessions
  for delete
  using (coach_id = auth.uid() or public.is_admin());

-- Availability: coaches can manage; athletes can read linked coach availability
create policy "availability select" on public.availability_blocks
  for select
  using (
    coach_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.coach_athlete_links l
      where l.coach_id = availability_blocks.coach_id
        and l.athlete_id = auth.uid()
    )
  );

create policy "availability insert" on public.availability_blocks
  for insert
  with check (coach_id = auth.uid() or public.is_admin());

create policy "availability update" on public.availability_blocks
  for update
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

create policy "availability delete" on public.availability_blocks
  for delete
  using (coach_id = auth.uid() or public.is_admin());

-- Threads and messaging
create policy "threads select" on public.threads
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = threads.id
        and tp.user_id = auth.uid()
    )
  );

create policy "threads insert" on public.threads
  for insert
  with check (public.is_admin() or auth.uid() = created_by);

create policy "thread participants select" on public.thread_participants
  for select
  using (
    public.is_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = thread_participants.thread_id
        and tp.user_id = auth.uid()
    )
  );

create policy "thread participants insert" on public.thread_participants
  for insert
  with check (user_id = auth.uid() or public.is_admin());

create policy "messages select" on public.messages
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = messages.thread_id
        and tp.user_id = auth.uid()
    )
  );

create policy "messages insert" on public.messages
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = messages.thread_id
        and tp.user_id = auth.uid()
    )
  );

create policy "receipts select" on public.message_receipts
  for select
  using (user_id = auth.uid() or public.is_admin());

create policy "receipts insert" on public.message_receipts
  for insert
  with check (user_id = auth.uid() or public.is_admin());

create policy "receipts update" on public.message_receipts
  for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "attachments select" on public.message_attachments
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.messages m
      join public.thread_participants tp on tp.thread_id = m.thread_id
      where m.id = message_attachments.message_id
        and tp.user_id = auth.uid()
    )
  );

create policy "attachments insert" on public.message_attachments
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.messages m
      join public.thread_participants tp on tp.thread_id = m.thread_id
      where m.id = message_attachments.message_id
        and tp.user_id = auth.uid()
    )
  );
