create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'postmark',
  message_id text,
  template text,
  to_email text,
  to_name text,
  from_email text,
  subject text,
  status text not null default 'queued',
  error text,
  metadata jsonb default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists email_deliveries_message_idx on public.email_deliveries(message_id);
create index if not exists email_deliveries_status_idx on public.email_deliveries(status);
create index if not exists email_deliveries_template_idx on public.email_deliveries(template);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  message_id text,
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  occurred_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists email_events_message_idx on public.email_events(message_id);
create index if not exists email_events_type_idx on public.email_events(event_type);
