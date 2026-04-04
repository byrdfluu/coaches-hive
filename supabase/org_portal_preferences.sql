alter table if exists public.org_settings
  add column if not exists portal_preferences jsonb default '{}'::jsonb;
