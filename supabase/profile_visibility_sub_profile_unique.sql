-- Allow profile visibility settings to exist per athlete sub-profile
-- while keeping a single main-profile row for NULL sub_profile_id.

alter table public.profile_visibility
  drop constraint if exists profile_visibility_athlete_id_section_key;

drop index if exists public.profile_visibility_unique_profile_section_idx;

create unique index if not exists profile_visibility_unique_profile_section_idx
  on public.profile_visibility (
    athlete_id,
    section,
    coalesce(sub_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
