alter table public.organizations add column if not exists complimentary_subscription_until timestamptz;

update public.organizations set
  platform_fee_rate = 0.04,
  payment_processing_responsibility = 'org_pays_processing',
  complimentary_subscription_until = '2027-03-24T00:00:00Z',
  updated_at = now()
where id = '72676163-6164-456d-9961-636164656d79';

alter table public.stripe_connect_payment_accounting
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists processing_fee_responsibility text,
  add column if not exists coaches_hive_net_amount_cents bigint,
  add column if not exists stripe_transfer_id text,
  add column if not exists refunded_amount_cents bigint not null default 0,
  add column if not exists dispute_amount_cents bigint not null default 0,
  add column if not exists dispute_status text;
