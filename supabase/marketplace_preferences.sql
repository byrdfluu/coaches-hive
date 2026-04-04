alter table if exists public.profiles
  add column if not exists marketplace_preferences jsonb not null default '{}'::jsonb;
