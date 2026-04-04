-- Backups + data retention policies

create table if not exists public.data_retention_policies (
  id uuid primary key default gen_random_uuid(),
  table_name text not null unique,
  date_column text not null default 'created_at',
  retention_days integer not null default 365,
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.data_retention_runs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  cutoff timestamptz not null,
  deleted_count integer not null default 0,
  run_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_policies (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'supabase',
  frequency text not null default 'daily',
  retention_days integer not null default 30,
  status text not null default 'unverified',
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists backup_policies_provider_unique
  on public.backup_policies (provider);

alter table public.data_retention_policies enable row level security;
alter table public.data_retention_runs enable row level security;
alter table public.backup_policies enable row level security;

drop policy if exists "retention policies select" on public.data_retention_policies;
create policy "retention policies select" on public.data_retention_policies
  for select using ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "retention policies manage" on public.data_retention_policies;
create policy "retention policies manage" on public.data_retention_policies
  for insert with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "retention policies update" on public.data_retention_policies;
create policy "retention policies update" on public.data_retention_policies
  for update using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "retention runs select" on public.data_retention_runs;
create policy "retention runs select" on public.data_retention_runs
  for select using ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "retention runs insert" on public.data_retention_runs;
create policy "retention runs insert" on public.data_retention_runs
  for insert with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "backup policies select" on public.backup_policies;
create policy "backup policies select" on public.backup_policies
  for select using ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "backup policies manage" on public.backup_policies;
create policy "backup policies manage" on public.backup_policies
  for insert with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "backup policies update" on public.backup_policies;
create policy "backup policies update" on public.backup_policies
  for update using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

insert into public.data_retention_policies (table_name, retention_days, enabled)
values
  ('admin_audit_log', 365, true),
  ('notifications', 90, true),
  ('message_receipts', 180, true)
on conflict (table_name) do nothing;

insert into public.backup_policies (provider, frequency, retention_days, status, notes)
values ('supabase', 'daily', 30, 'unverified', 'Enable backups in Supabase dashboard.')
on conflict do nothing;
