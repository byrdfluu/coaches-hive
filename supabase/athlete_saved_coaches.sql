-- Athlete saved coaches (bookmarked/favorited coaches)

create table if not exists public.athlete_saved_coaches (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, coach_id)
);

create index if not exists athlete_saved_coaches_athlete_idx on public.athlete_saved_coaches(athlete_id);
create index if not exists athlete_saved_coaches_coach_idx on public.athlete_saved_coaches(coach_id);

alter table public.athlete_saved_coaches enable row level security;

drop policy if exists "athlete saved coaches select" on public.athlete_saved_coaches;
create policy "athlete saved coaches select" on public.athlete_saved_coaches
  for select using (
    athlete_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "athlete saved coaches insert" on public.athlete_saved_coaches;
create policy "athlete saved coaches insert" on public.athlete_saved_coaches
  for insert with check (
    athlete_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "athlete saved coaches delete" on public.athlete_saved_coaches;
create policy "athlete saved coaches delete" on public.athlete_saved_coaches
  for delete using (
    athlete_id = auth.uid()
    or public.is_admin()
  );
