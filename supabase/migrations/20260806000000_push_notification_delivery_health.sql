create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_token_suffix text not null,
  environment text not null,
  status text not null check (status in ('delivered','failed','invalid')),
  apns_status integer,
  failure_reason text,
  action_url text,
  created_at timestamptz not null default now()
);
create index if not exists push_notification_deliveries_created_idx on public.push_notification_deliveries(created_at desc);
alter table public.push_notification_deliveries enable row level security;
revoke all on public.push_notification_deliveries from anon, authenticated;
