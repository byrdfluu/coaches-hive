-- Admin audit log table

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_action_idx on public.admin_audit_log(action);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admin audit select" on public.admin_audit_log;
create policy "admin audit select" on public.admin_audit_log
  for select using ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "admin audit insert" on public.admin_audit_log;
create policy "admin audit insert" on public.admin_audit_log
  for insert with check ((auth.jwt() ->> 'role') = 'admin');
