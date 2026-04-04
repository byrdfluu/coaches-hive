alter table public.sessions
  add column if not exists attendance_status text;
