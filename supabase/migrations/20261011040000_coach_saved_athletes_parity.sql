create table if not exists public.coach_saved_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

create unique index if not exists coach_saved_athletes_coach_athlete_key
  on public.coach_saved_athletes(coach_id, athlete_id);
create index if not exists coach_saved_athletes_athlete_idx
  on public.coach_saved_athletes(athlete_id);

alter table public.coach_saved_athletes enable row level security;
drop policy if exists coach_saved_athletes_own on public.coach_saved_athletes;
create policy coach_saved_athletes_own on public.coach_saved_athletes
for all to authenticated
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

grant select, insert, delete on public.coach_saved_athletes to authenticated;
