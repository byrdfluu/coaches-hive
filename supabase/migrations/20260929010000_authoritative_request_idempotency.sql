-- Durable API idempotency for Vercel-safe money-changing requests.
create table if not exists public.api_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  resource_id text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  request_id text not null,
  status text not null default 'processing' check (status in ('processing','completed')),
  response_status integer,
  response_body jsonb,
  response_headers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(actor_user_id,action,resource_id,idempotency_key)
);
create index if not exists api_idempotency_records_created_idx
  on public.api_idempotency_records(created_at desc);
alter table public.api_idempotency_records enable row level security;
revoke all on public.api_idempotency_records from anon,authenticated;

alter table if exists public.stripe_webhook_events
  add column if not exists request_id text;

alter table if exists public.organization_recurring_fees
  add column if not exists request_id text,
  add column if not exists request_fingerprint text;
