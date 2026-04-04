-- Athlete profile extensions (metrics, results, media, visibility)

create table if not exists public.athlete_metrics (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  value text not null,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists athlete_metrics_athlete_idx on public.athlete_metrics(athlete_id);

create table if not exists public.athlete_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  event_date date,
  placement text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists athlete_results_athlete_idx on public.athlete_results(athlete_id);

create table if not exists public.athlete_media (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  media_url text not null,
  media_type text not null default 'image',
  created_at timestamptz not null default now()
);

create index if not exists athlete_media_athlete_idx on public.athlete_media(athlete_id);

create table if not exists public.profile_visibility (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  section text not null,
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  unique (athlete_id, section)
);

create index if not exists profile_visibility_athlete_idx on public.profile_visibility(athlete_id);

alter table public.profile_visibility
  drop constraint if exists profile_visibility_visibility_check;

alter table public.profile_visibility
  add constraint profile_visibility_visibility_check
  check (visibility in ('public','coach','org','private'));

alter table public.athlete_metrics enable row level security;
alter table public.athlete_results enable row level security;
alter table public.athlete_media enable row level security;
alter table public.profile_visibility enable row level security;

-- Profile visibility: readable for everyone to drive public/profile gating
drop policy if exists "profile visibility read" on public.profile_visibility;
create policy "profile visibility read" on public.profile_visibility
  for select using (true);

drop policy if exists "profile visibility manage" on public.profile_visibility;
create policy "profile visibility manage" on public.profile_visibility
  for insert with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "profile visibility update" on public.profile_visibility;
create policy "profile visibility update" on public.profile_visibility
  for update using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

-- Metrics/results/media access
drop policy if exists "athlete metrics select" on public.athlete_metrics;
create policy "athlete metrics select" on public.athlete_metrics
  for select using (
    public.is_admin()
    or athlete_id = auth.uid()
    or exists (
      select 1 from public.profile_visibility v
      where v.athlete_id = athlete_metrics.athlete_id
        and v.section = 'metrics'
        and v.visibility = 'public'
    )
    or exists (
      select 1 from public.coach_athlete_links l
      where l.athlete_id = athlete_metrics.athlete_id
        and l.coach_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships athlete
        on athlete.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('org_admin','school_admin','athletic_director','team_manager','coach','assistant_coach')
        and athlete.user_id = athlete_metrics.athlete_id
    )
  );

drop policy if exists "athlete metrics manage" on public.athlete_metrics;
create policy "athlete metrics manage" on public.athlete_metrics
  for insert with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete metrics update" on public.athlete_metrics;
create policy "athlete metrics update" on public.athlete_metrics
  for update using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete metrics delete" on public.athlete_metrics;
create policy "athlete metrics delete" on public.athlete_metrics
  for delete using (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete results select" on public.athlete_results;
create policy "athlete results select" on public.athlete_results
  for select using (
    public.is_admin()
    or athlete_id = auth.uid()
    or exists (
      select 1 from public.profile_visibility v
      where v.athlete_id = athlete_results.athlete_id
        and v.section = 'results'
        and v.visibility = 'public'
    )
    or exists (
      select 1 from public.coach_athlete_links l
      where l.athlete_id = athlete_results.athlete_id
        and l.coach_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships athlete
        on athlete.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('org_admin','school_admin','athletic_director','team_manager','coach','assistant_coach')
        and athlete.user_id = athlete_results.athlete_id
    )
  );

drop policy if exists "athlete results manage" on public.athlete_results;
create policy "athlete results manage" on public.athlete_results
  for insert with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete results update" on public.athlete_results;
create policy "athlete results update" on public.athlete_results
  for update using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete results delete" on public.athlete_results;
create policy "athlete results delete" on public.athlete_results
  for delete using (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete media select" on public.athlete_media;
create policy "athlete media select" on public.athlete_media
  for select using (
    public.is_admin()
    or athlete_id = auth.uid()
    or exists (
      select 1 from public.profile_visibility v
      where v.athlete_id = athlete_media.athlete_id
        and v.section = 'media'
        and v.visibility = 'public'
    )
    or exists (
      select 1 from public.coach_athlete_links l
      where l.athlete_id = athlete_media.athlete_id
        and l.coach_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships athlete
        on athlete.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('org_admin','school_admin','athletic_director','team_manager','coach','assistant_coach')
        and athlete.user_id = athlete_media.athlete_id
    )
  );

drop policy if exists "athlete media manage" on public.athlete_media;
create policy "athlete media manage" on public.athlete_media
  for insert with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete media update" on public.athlete_media;
create policy "athlete media update" on public.athlete_media
  for update using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete media delete" on public.athlete_media;
create policy "athlete media delete" on public.athlete_media
  for delete using (athlete_id = auth.uid() or public.is_admin());
