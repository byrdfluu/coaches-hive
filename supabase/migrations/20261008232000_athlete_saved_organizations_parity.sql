create table if not exists public.athlete_saved_organizations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(athlete_id,org_id)
);
alter table public.athlete_saved_organizations enable row level security;
drop policy if exists athletes_manage_own_saved_organizations on public.athlete_saved_organizations;
create policy athletes_manage_own_saved_organizations on public.athlete_saved_organizations for all to authenticated
using(public.owns_athlete_profile(athlete_id)) with check(public.owns_athlete_profile(athlete_id));
create index if not exists athlete_saved_organizations_athlete_idx on public.athlete_saved_organizations(athlete_id);
