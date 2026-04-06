-- Athlete sport and location columns on profiles.
-- Safe to run multiple times.

alter table if exists public.profiles
  add column if not exists athlete_sport text,
  add column if not exists athlete_location text;
