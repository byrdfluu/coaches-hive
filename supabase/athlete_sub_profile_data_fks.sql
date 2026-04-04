-- Add sub_profile_id FK to data tables so notes and sessions can be
-- scoped to a specific family sub-profile.
-- NULL sub_profile_id = belongs to the main account.

alter table athlete_progress_notes
  add column if not exists sub_profile_id uuid references athlete_sub_profiles(id) on delete set null;

alter table sessions
  add column if not exists sub_profile_id uuid references athlete_sub_profiles(id) on delete set null;