-- Org marketplace support
alter table if exists public.products
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists team_id uuid references public.org_teams(id) on delete set null,
  add column if not exists inventory_count integer,
  add column if not exists shipping_required boolean default false,
  add column if not exists shipping_notes text;

alter table if exists public.orders
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists platform_fee numeric,
  add column if not exists platform_fee_rate numeric,
  add column if not exists net_amount numeric,
  add column if not exists payment_intent_id text,
  add column if not exists fulfillment_status text default 'unfulfilled',
  add column if not exists fulfillment_notes text,
  add column if not exists tracking_number text,
  add column if not exists shipping_address text,
  add column if not exists refund_status text,
  add column if not exists refund_amount numeric,
  add column if not exists refunded_at timestamptz;
