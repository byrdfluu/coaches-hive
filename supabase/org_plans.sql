alter table if exists public.org_settings
  add column if not exists plan text
  check (plan in ('standard', 'growth', 'enterprise'))
  default 'standard';

alter table if exists public.org_settings
  add column if not exists plan_status text
  check (plan_status in ('trialing', 'active', 'past_due', 'canceled'))
  default 'trialing';
