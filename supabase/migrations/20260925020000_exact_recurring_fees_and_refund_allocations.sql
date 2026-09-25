alter table public.organization_recurring_fees
  add column if not exists billing_mode text not null default 'stripe_subscription',
  add column if not exists stripe_payment_method_id text,
  add column if not exists next_charge_at timestamptz,
  add column if not exists last_charge_at timestamptz;

create index if not exists organization_recurring_fees_due_idx
  on public.organization_recurring_fees(next_charge_at)
  where billing_mode = 'scheduled_payment_intent' and status in ('active','past_due');

alter table public.organization_recurring_fee_invoices
  add column if not exists period_key text,
  add column if not exists base_amount_cents bigint,
  add column if not exists service_fee_cents bigint not null default 0,
  add column if not exists platform_fee_cents bigint not null default 0,
  add column if not exists organization_net_cents bigint;

create unique index if not exists organization_recurring_fee_period_uidx
  on public.organization_recurring_fee_invoices(recurring_fee_id,period_key)
  where period_key is not null;

alter table public.payment_refund_requests
  add column if not exists refund_type text not null default 'standard'
    check (refund_type in ('standard','full_org_caused')),
  add column if not exists base_refund_cents bigint,
  add column if not exists service_fee_refund_cents bigint not null default 0,
  add column if not exists transfer_reversal_cents bigint not null default 0,
  add column if not exists stripe_transfer_reversal_id text,
  add column if not exists organization_receivable_cents bigint not null default 0,
  add column if not exists parent_end_balance_cents bigint,
  add column if not exists organization_end_balance_cents bigint,
  add column if not exists platform_end_balance_cents bigint;

create table if not exists public.organization_payment_receivables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  refund_request_id uuid not null references public.payment_refund_requests(id),
  amount_cents bigint not null check (amount_cents > 0),
  recovered_cents bigint not null default 0 check (recovered_cents >= 0),
  status text not null default 'open' check (status in ('open','partially_recovered','recovered','waived')),
  reason text not null,
  stripe_account_debit_charge_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(refund_request_id)
);

alter table public.organization_payment_receivables enable row level security;
revoke all on public.organization_payment_receivables from anon, authenticated;
grant all on public.organization_payment_receivables to service_role;
