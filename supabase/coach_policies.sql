-- Session policy fields for coach profiles
alter table if exists public.profiles
  add column if not exists coach_cancel_window text,
  add column if not exists coach_reschedule_window text,
  add column if not exists coach_refund_policy text;
