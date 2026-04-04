-- Add sub_profile_id FK to athlete data tables so each sub-profile
-- has its own isolated metrics, results, media, and visibility settings.
-- NULL = belongs to the main account profile; non-null = belongs to a sub-profile.

alter table athlete_metrics
  add column if not exists sub_profile_id uuid references athlete_sub_profiles(id) on delete cascade;

alter table athlete_results
  add column if not exists sub_profile_id uuid references athlete_sub_profiles(id) on delete cascade;

alter table athlete_media
  add column if not exists sub_profile_id uuid references athlete_sub_profiles(id) on delete cascade;

alter table profile_visibility
  add column if not exists sub_profile_id uuid references athlete_sub_profiles(id) on delete cascade;
