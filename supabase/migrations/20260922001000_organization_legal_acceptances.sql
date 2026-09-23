-- Durable evidence of organization clickwrap and recurring-billing consent.
create table if not exists public.organization_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accepted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  accepted_by_email text,
  accepted_by_role text,
  agreement_version text not null,
  agreement_keys text[] not null,
  authority_confirmed boolean not null check(authority_confirmed),
  recurring_billing_confirmed boolean not null check(recurring_billing_confirmed),
  minor_data_responsibility_confirmed boolean not null check(minor_data_responsibility_confirmed),
  plan_key text not null,
  billing_interval text not null check(billing_interval in ('month','year')),
  price_cents bigint not null check(price_cents >= 0),
  trial_days integer not null default 0 check(trial_days >= 0),
  confirmation_text jsonb not null,
  ip_address text,
  user_agent text,
  stripe_checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists organization_legal_acceptances_org_date_idx
  on public.organization_legal_acceptances(organization_id, accepted_at desc);

alter table public.organization_legal_acceptances enable row level security;
revoke all on public.organization_legal_acceptances from public, anon, authenticated;
grant all on public.organization_legal_acceptances to service_role;

