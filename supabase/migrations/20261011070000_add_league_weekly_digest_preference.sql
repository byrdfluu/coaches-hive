-- Both web and iOS expose this preference. Add it forward rather than
-- changing the historical notification migration that may already be live.

alter table public.league_notification_preferences
  add column if not exists weekly_digest boolean not null default true;

notify pgrst, 'reload schema';
