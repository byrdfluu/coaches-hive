-- Stripe webhook idempotency + processing state

create table if not exists public.stripe_webhook_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create index if not exists stripe_webhook_events_received_idx
  on public.stripe_webhook_events(received_at desc);
