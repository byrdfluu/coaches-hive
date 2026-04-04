-- Communication preferences for coach profiles
alter table if exists public.profiles
  add column if not exists coach_messaging_hours text,
  add column if not exists coach_auto_reply text,
  add column if not exists coach_silence_outside_hours boolean default false;
