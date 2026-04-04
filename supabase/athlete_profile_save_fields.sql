-- Athlete profile and settings fields used by signup, settings, and athlete profile flows.
-- Safe to run multiple times.

alter table if exists public.profiles
  add column if not exists avatar_url text,
  add column if not exists athlete_birthdate text,
  add column if not exists athlete_season text,
  add column if not exists athlete_grade_level text,
  add column if not exists guardian_name text,
  add column if not exists guardian_email text,
  add column if not exists guardian_phone text,
  add column if not exists guardian_approval_rule text,
  add column if not exists account_owner_type text,
  add column if not exists notification_prefs jsonb default '{}'::jsonb,
  add column if not exists athlete_privacy_settings jsonb default '{}'::jsonb,
  add column if not exists athlete_communication_settings jsonb default '{}'::jsonb,
  add column if not exists integration_settings jsonb default '{}'::jsonb;

alter table if exists public.profiles
  alter column guardian_approval_rule set default 'required';

alter table if exists public.profiles
  alter column account_owner_type set default 'athlete_adult';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_guardian_approval_rule_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_guardian_approval_rule_check
      check (guardian_approval_rule in ('required', 'notify', 'none'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_owner_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_owner_type_check
      check (account_owner_type in ('athlete_adult', 'athlete_minor', 'guardian'));
  end if;
end
$$;
