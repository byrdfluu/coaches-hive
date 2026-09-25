alter table public.organizations
  alter column platform_fee_rate set default 0.04,
  alter column payment_processing_responsibility set default 'org_pays_processing';

update public.organizations
set platform_fee_rate = 0.04,
    payment_processing_responsibility = 'org_pays_processing',
    updated_at = now()
where id = '72676163-6164-456d-9961-636164656d79';

alter table public.stripe_connect_payment_accounting
  add column if not exists base_amount_cents bigint,
  add column if not exists service_fee_cents bigint not null default 0,
  add column if not exists total_amount_cents bigint,
  add column if not exists organization_net_amount_cents bigint,
  add column if not exists payment_method_type text,
  add column if not exists service_fee_refundable boolean not null default false,
  add column if not exists payment_policy_version text,
  add column if not exists agreement_version text;

alter table public.payment_transactions
  add column if not exists base_amount_cents bigint,
  add column if not exists service_fee_cents bigint not null default 0,
  add column if not exists total_amount_cents bigint,
  add column if not exists organization_net_amount_cents bigint,
  add column if not exists payment_method_type text,
  add column if not exists service_fee_refundable boolean not null default false,
  add column if not exists payment_policy_version text,
  add column if not exists agreement_version text;
