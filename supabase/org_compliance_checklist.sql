alter table if exists public.org_settings
  add column if not exists compliance_checklist jsonb default '{}'::jsonb;
