create table if not exists public.athlete_progress_notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists athlete_progress_notes_athlete_idx
  on public.athlete_progress_notes(athlete_id, created_at desc);

alter table public.athlete_progress_notes enable row level security;

drop policy if exists "athlete progress notes select" on public.athlete_progress_notes;
create policy "athlete progress notes select" on public.athlete_progress_notes
  for select using (
    public.is_admin()
    or athlete_id = auth.uid()
    or exists (
      select 1 from public.coach_athlete_links l
      where l.athlete_id = athlete_progress_notes.athlete_id
        and l.coach_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships athlete
        on athlete.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('org_admin','school_admin','athletic_director','team_manager','coach','assistant_coach')
        and athlete.user_id = athlete_progress_notes.athlete_id
    )
  );

drop policy if exists "athlete progress notes insert" on public.athlete_progress_notes;
create policy "athlete progress notes insert" on public.athlete_progress_notes
  for insert with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete progress notes update" on public.athlete_progress_notes;
create policy "athlete progress notes update" on public.athlete_progress_notes
  for update using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete progress notes delete" on public.athlete_progress_notes;
create policy "athlete progress notes delete" on public.athlete_progress_notes
  for delete using (athlete_id = auth.uid() or public.is_admin());
