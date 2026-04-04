alter table if exists public.thread_participants
  add column if not exists muted_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists blocked_at timestamptz,
  add column if not exists pinned_at timestamptz;
