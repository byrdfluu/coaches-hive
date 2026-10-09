-- Complete the cross-platform metadata contract for private athlete highlights.
create table if not exists public.athlete_highlights (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  storage_path text not null unique,
  file_name text,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table if exists public.athlete_highlights
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists duration_seconds numeric;

alter table if exists public.athlete_highlights
  drop constraint if exists athlete_highlights_size_bytes_check,
  add constraint athlete_highlights_size_bytes_check check (size_bytes is null or size_bytes > 0),
  drop constraint if exists athlete_highlights_duration_seconds_check,
  add constraint athlete_highlights_duration_seconds_check check (
    duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 180)
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-athlete-media', 'private-athlete-media', false, 209715200,
  array['image/jpeg','image/png','image/heic','video/mp4','video/quicktime','video/x-m4v']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.athlete_highlights enable row level security;

drop policy if exists athlete_highlights_authorized_read on public.athlete_highlights;
create policy athlete_highlights_authorized_read on public.athlete_highlights
for select to authenticated using (
  public.owns_athlete_profile(athlete_id)
  or public.is_coach_of_athlete_profile(athlete_id)
  or public.can_access_athlete_in_active_workspace(athlete_id)
);

drop policy if exists athlete_highlights_family_manage on public.athlete_highlights;
create policy athlete_highlights_family_manage on public.athlete_highlights
for all to authenticated
using (public.owns_athlete_profile(athlete_id))
with check (public.owns_athlete_profile(athlete_id) and created_by = auth.uid());

drop policy if exists athlete_highlights_storage_read on storage.objects;
create policy athlete_highlights_storage_read on storage.objects
for select to authenticated using (
  bucket_id = 'private-athlete-media'
  and exists (
    select 1 from public.athlete_highlights h
    where h.storage_path = name and (
      public.owns_athlete_profile(h.athlete_id)
      or public.is_coach_of_athlete_profile(h.athlete_id)
      or public.can_access_athlete_in_active_workspace(h.athlete_id)
    )
  )
);

create index if not exists athlete_highlights_athlete_created_idx
  on public.athlete_highlights(athlete_id, created_at desc);
