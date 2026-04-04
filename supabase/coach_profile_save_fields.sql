-- Coach profile and settings fields used by the coach settings and profile flows.
-- Safe to run multiple times.

alter table if exists public.profiles
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists certifications text,
  add column if not exists coach_seasons text[] default '{}',
  add column if not exists coach_grades text[] default '{}',
  add column if not exists coach_profile_settings jsonb default '{}'::jsonb,
  add column if not exists coach_security_settings jsonb default '{}'::jsonb,
  add column if not exists coach_privacy_settings jsonb default '{}'::jsonb,
  add column if not exists coach_cancel_window text,
  add column if not exists coach_reschedule_window text,
  add column if not exists coach_refund_policy text,
  add column if not exists coach_messaging_hours text,
  add column if not exists coach_auto_reply text,
  add column if not exists coach_silence_outside_hours boolean default false,
  add column if not exists notification_prefs jsonb default '{}'::jsonb,
  add column if not exists integration_settings jsonb default '{}'::jsonb,
  add column if not exists calendar_feed_token text,
  add column if not exists payout_schedule text,
  add column if not exists payout_day text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_cover_url text,
  add column if not exists brand_primary_color text,
  add column if not exists brand_accent_color text,
  add column if not exists verification_status text,
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists has_id_document boolean default false,
  add column if not exists has_certifications boolean default false;

create unique index if not exists profiles_calendar_feed_token_idx
  on public.profiles (calendar_feed_token)
  where calendar_feed_token is not null;
