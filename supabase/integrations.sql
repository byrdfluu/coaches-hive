-- Integration settings for calendar + video providers
alter table if exists public.profiles
  add column if not exists integration_settings jsonb,
  add column if not exists calendar_feed_token text;

create unique index if not exists profiles_calendar_feed_token_idx on public.profiles(calendar_feed_token);
