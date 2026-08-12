-- Ensure every field used by the native coach profile editor exists.
-- Safe to rerun and does not modify profile roles or existing values.

alter table public.profiles
  add column if not exists coaching_philosophy text,
  add column if not exists specialties text[] not null default '{}',
  add column if not exists age_groups text[] not null default '{}',
  add column if not exists competition_levels text[] not null default '{}',
  add column if not exists certifications text[] not null default '{}',
  add column if not exists coaching_experience_years integer,
  add column if not exists website_url text,
  add column if not exists inquiry_url text,
  add column if not exists availability_summary text,
  add column if not exists achievements text[] not null default '{}';

update public.profiles set
  specialties = coalesce(specialties, '{}'),
  age_groups = coalesce(age_groups, '{}'),
  competition_levels = coalesce(competition_levels, '{}'),
  certifications = coalesce(certifications, '{}'),
  achievements = coalesce(achievements, '{}')
where specialties is null or age_groups is null or competition_levels is null
   or certifications is null or achievements is null;

alter table public.independent_coach_profiles
  add column if not exists services text[] not null default '{}',
  add column if not exists training_locations text[] not null default '{}',
  add column if not exists remote_available boolean not null default false,
  add column if not exists in_person_available boolean not null default true,
  add column if not exists pricing_summary text,
  add column if not exists session_price_cents integer,
  add column if not exists group_session_price_cents integer,
  add column if not exists camp_price_cents integer,
  add column if not exists testimonials text[] not null default '{}';

update public.independent_coach_profiles set
  services = coalesce(services, '{}'),
  training_locations = coalesce(training_locations, '{}'),
  remote_available = coalesce(remote_available, false),
  in_person_available = coalesce(in_person_available, true),
  testimonials = coalesce(testimonials, '{}')
where services is null or training_locations is null or remote_available is null
   or in_person_available is null or testimonials is null;
