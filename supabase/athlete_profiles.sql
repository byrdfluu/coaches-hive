-- athlete_profiles: unified athlete profile table.
-- Primary profiles have id = owner_user_id. Sub-profiles use a distinct UUID.
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS).

create table if not exists public.athlete_profiles (
  id              uuid        primary key,
  owner_user_id   uuid        not null references public.profiles(id) on delete cascade,
  auth_user_id    uuid        references auth.users(id) on delete set null,
  is_primary      boolean     not null default false,
  display_order   integer     default 0,
  status          text        not null default 'active',
  full_name       text        not null,
  avatar_url      text,
  bio             text,
  sport           text,
  location        text,
  season          text,
  grade_level     text,
  birthdate       text,
  slug            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists athlete_profiles_owner_idx
  on public.athlete_profiles(owner_user_id);

create index if not exists athlete_profiles_primary_idx
  on public.athlete_profiles(owner_user_id, is_primary);

create index if not exists athlete_profiles_slug_idx
  on public.athlete_profiles(slug);

alter table public.athlete_profiles enable row level security;

-- Athletes can read their own profile rows
drop policy if exists "athlete profiles select own" on public.athlete_profiles;
create policy "athlete profiles select own" on public.athlete_profiles
  for select
  using (owner_user_id = auth.uid() or public.is_admin());

-- Coaches can read profiles of their linked athletes
drop policy if exists "athlete profiles select linked coach" on public.athlete_profiles;
create policy "athlete profiles select linked coach" on public.athlete_profiles
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.coach_athlete_links l
      where l.athlete_id = athlete_profiles.owner_user_id
        and l.coach_id = auth.uid()
    )
  );

-- Org staff can read profiles of athletes in their organization
drop policy if exists "athlete profiles select org staff" on public.athlete_profiles;
create policy "athlete profiles select org staff" on public.athlete_profiles
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
        and member.user_id = athlete_profiles.owner_user_id
    )
  );

-- Athletes can insert their own profile rows
drop policy if exists "athlete profiles insert own" on public.athlete_profiles;
create policy "athlete profiles insert own" on public.athlete_profiles
  for insert
  with check (owner_user_id = auth.uid() or public.is_admin());

-- Athletes can update their own profile rows
drop policy if exists "athlete profiles update own" on public.athlete_profiles;
create policy "athlete profiles update own" on public.athlete_profiles
  for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- Athletes can delete their own sub-profile rows (primary cannot be deleted by application logic)
drop policy if exists "athlete profiles delete own" on public.athlete_profiles;
create policy "athlete profiles delete own" on public.athlete_profiles
  for delete
  using (owner_user_id = auth.uid() or public.is_admin());
