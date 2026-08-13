-- Locations entered by organization staff for sessions, practices, and games.
-- Safe to rerun.

alter table public.sessions
  add column if not exists location text;

alter table public.practice_plans
  add column if not exists location text;
