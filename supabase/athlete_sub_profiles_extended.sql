-- Extend athlete_sub_profiles with richer per-profile fields.
-- NULL values = not yet set for that sub-profile.

alter table athlete_sub_profiles
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists birthdate date,
  add column if not exists grade_level text,
  add column if not exists season text,
  add column if not exists location text;
