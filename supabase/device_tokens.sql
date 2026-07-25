-- Device tokens for app-first APNs delivery. Safe to rerun.
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_manage_own on public.device_tokens;
create policy device_tokens_manage_own
  on public.device_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists device_tokens_user_idx
  on public.device_tokens(user_id);
