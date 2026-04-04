-- Notification preferences stored per user profile
alter table if exists public.profiles
  add column if not exists notification_prefs jsonb;
