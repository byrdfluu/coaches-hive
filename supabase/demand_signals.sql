create table if not exists public.demand_signal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  role text,
  event_type text not null,
  signal text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists demand_signal_events_created_at_idx on public.demand_signal_events(created_at desc);
create index if not exists demand_signal_events_signal_idx on public.demand_signal_events(signal);
create index if not exists demand_signal_events_event_type_idx on public.demand_signal_events(event_type);

alter table public.demand_signal_events enable row level security;

create policy "demand_signal_events insert" on public.demand_signal_events
  for insert
  with check (user_id = auth.uid() or public.is_admin());

create policy "demand_signal_events select" on public.demand_signal_events
  for select
  using (public.is_admin());
