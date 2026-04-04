create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null,
  specific_date date,
  start_time time not null,
  end_time time not null,
  session_type text,
  location text,
  timezone text default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists availability_blocks_coach_day_idx on public.availability_blocks(coach_id, day_of_week);
create index if not exists availability_blocks_coach_date_idx on public.availability_blocks(coach_id, specific_date);

alter table public.sessions add column if not exists end_time timestamptz;
alter table public.sessions add column if not exists duration_minutes integer;
alter table public.sessions add column if not exists external_provider text;
alter table public.sessions add column if not exists external_event_id text;
alter table public.sessions add column if not exists external_calendar_id text;
alter table public.sessions add column if not exists sync_status text;
alter table public.sessions add column if not exists updated_at timestamptz default now();
