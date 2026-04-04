-- Sessions — add columns required by bookings and cancellation flows
-- Safe to run multiple times — ADD COLUMN IF NOT EXISTS is a no-op if the column already exists.

alter table public.sessions add column if not exists meeting_mode text;
alter table public.sessions add column if not exists meeting_provider text;
alter table public.sessions add column if not exists meeting_link text;
alter table public.sessions add column if not exists cancel_reason text;
alter table public.sessions add column if not exists payment_intent_id text;
alter table public.sessions add column if not exists session_type text;
alter table public.sessions add column if not exists title text;
alter table public.sessions add column if not exists type text;
alter table public.sessions add column if not exists notes text;
