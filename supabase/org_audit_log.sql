create table if not exists public.org_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists org_audit_log_org_id_idx on public.org_audit_log (org_id);
create index if not exists org_audit_log_created_at_idx on public.org_audit_log (created_at desc);
