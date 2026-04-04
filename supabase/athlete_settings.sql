alter table profiles
  add column if not exists athlete_privacy_settings jsonb default '{}'::jsonb;

alter table profiles
  add column if not exists athlete_communication_settings jsonb default '{}'::jsonb;
