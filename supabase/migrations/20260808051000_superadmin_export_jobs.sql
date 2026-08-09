create table if not exists public.admin_export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  dataset text not null check (dataset in ('payment_accounting','platform_fees','subscriptions','refunds','audit_logs','waiver_document_proofs','workspace_reconciliation','organization_engagement')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('ready','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);
create index if not exists admin_export_jobs_expiry_idx on public.admin_export_jobs(expires_at);
alter table public.admin_export_jobs enable row level security;
drop policy if exists "superadmins manage export jobs" on public.admin_export_jobs;
create policy "superadmins manage export jobs" on public.admin_export_jobs for all to authenticated
  using(public.is_admin(auth.uid())) with check(public.is_admin(auth.uid()));
revoke all on public.admin_export_jobs from public,anon;
grant select,insert,update on public.admin_export_jobs to authenticated;

