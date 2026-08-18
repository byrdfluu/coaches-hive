-- Canonical mobile/web payment contract and additive legacy normalization.

alter table public.payment_transactions
  add column if not exists amount_cents bigint,
  add column if not exists net_cents bigint;

update public.payment_transactions
set amount_cents = coalesce(amount_cents, gross_amount_cents),
    net_cents = coalesce(net_cents, net_amount_cents)
where amount_cents is null or net_cents is null;

alter table public.payment_transactions
  alter column amount_cents set not null,
  alter column net_cents set not null;

alter table public.payment_transactions
  drop constraint if exists payment_transactions_amount_cents_check,
  add constraint payment_transactions_amount_cents_check check (amount_cents >= 0),
  drop constraint if exists payment_transactions_net_cents_check,
  add constraint payment_transactions_net_cents_check check (net_cents >= 0);

-- PostgREST/stripe idempotent upserts must be able to infer this conflict target.
-- A regular unique index still permits multiple nulls while supporting ON CONFLICT.
drop index if exists public.payment_transactions_payment_intent_uidx;
create unique index payment_transactions_payment_intent_uidx
  on public.payment_transactions(stripe_payment_intent_id);

-- Keep compatibility columns synchronized while clients move to amount_cents/net_cents.
create or replace function public.sync_payment_transaction_cents()
returns trigger language plpgsql as $$
begin
  new.amount_cents := coalesce(new.amount_cents, new.gross_amount_cents);
  new.gross_amount_cents := coalesce(new.gross_amount_cents, new.amount_cents);
  new.net_cents := coalesce(new.net_cents, new.net_amount_cents);
  new.net_amount_cents := coalesce(new.net_amount_cents, new.net_cents);
  return new;
end;
$$;

drop trigger if exists sync_payment_transaction_cents_trigger on public.payment_transactions;
create trigger sync_payment_transaction_cents_trigger
before insert or update on public.payment_transactions
for each row execute function public.sync_payment_transaction_cents();

-- Normalize legacy money tables without deleting the display-dollar columns.
alter table if exists public.payment_receipts
  add column if not exists amount_cents bigint,
  add column if not exists refund_amount_cents bigint;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='payment_receipts' and column_name='amount') then
    execute 'update public.payment_receipts set amount_cents=round(amount*100) where amount_cents is null and amount is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='payment_receipts' and column_name='refund_amount') then
    execute 'update public.payment_receipts set refund_amount_cents=round(refund_amount*100) where refund_amount_cents is null and refund_amount is not null';
  end if;
end $$;

alter table if exists public.org_fee_assignments
  add column if not exists amount_cents integer,
  add column if not exists payment_sequence_number integer,
  add column if not exists autopay boolean not null default false,
  add column if not exists days_past_due integer not null default 0,
  add column if not exists retry_count integer not null default 0,
  add column if not exists paid_off_platform boolean not null default false;
update public.org_fee_assignments assignment
set amount_cents = coalesce(assignment.amount_cents, fee.amount_cents)
from public.org_fees fee
where fee.id = assignment.fee_id and assignment.amount_cents is null;

alter table if exists public.org_payments
  add column if not exists amount_cents bigint,
  add column if not exists platform_fee_cents bigint,
  add column if not exists stripe_processing_fee_cents bigint,
  add column if not exists net_cents bigint;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_payments' and column_name='amount') then
    execute 'update public.org_payments set amount_cents=coalesce(amount_cents,round(amount*100)), platform_fee_cents=coalesce(platform_fee_cents,0), net_cents=coalesce(net_cents,round(amount*100)-coalesce(platform_fee_cents,0)) where amount is not null and (amount_cents is null or platform_fee_cents is null or net_cents is null)';
  end if;
end $$;

alter table if exists public.orders
  add column if not exists amount_cents bigint,
  add column if not exists platform_fee_cents bigint,
  add column if not exists stripe_processing_fee_cents bigint,
  add column if not exists net_cents bigint;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='amount') then
    execute 'update public.orders set amount_cents=round(amount*100) where amount_cents is null and amount is not null';
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total') then
    execute 'update public.orders set amount_cents=round(total*100) where amount_cents is null and total is not null';
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='price') then
    execute 'update public.orders set amount_cents=round(price*100) where amount_cents is null and price is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='platform_fee') then
    execute 'update public.orders set platform_fee_cents=round(platform_fee*100) where platform_fee_cents is null and platform_fee is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='net_amount') then
    execute 'update public.orders set net_cents=round(net_amount*100) where net_cents is null and net_amount is not null';
  end if;
end $$;

alter table if exists public.tryout_registrations
  add column if not exists amount_cents bigint,
  add column if not exists platform_fee_cents bigint,
  add column if not exists stripe_processing_fee_cents bigint,
  add column if not exists net_cents bigint,
  add column if not exists payment_method_brand text,
  add column if not exists payment_method_last4 text;

alter table if exists public.org_enrollment_submissions
  add column if not exists amount_due_cents bigint,
  add column if not exists platform_fee_cents bigint,
  add column if not exists stripe_processing_fee_cents bigint,
  add column if not exists net_cents bigint,
  add column if not exists waiver_signed_at timestamptz;

alter table if exists public.athlete_payment_methods
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text;

-- Retry audit is append-only and provides the day 3/7/14 outcome trail.
create table if not exists public.org_dues_retry_attempts (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.org_dues_installments(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  scheduled_for timestamptz not null,
  attempted_at timestamptz,
  outcome text not null default 'scheduled' check (outcome in ('scheduled','succeeded','failed','skipped')),
  stripe_payment_intent_id text,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  unique(installment_id, attempt_number)
);

-- Event obligations allow any number of partial transactions against one player share.
create table if not exists public.org_event_obligations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.org_event_collections(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete set null,
  family_account_id uuid references public.profiles(id) on delete set null,
  amount_due_cents integer not null check (amount_due_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','waived','paid_off_platform')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, player_id)
);
create table if not exists public.org_event_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.org_event_obligations(id) on delete cascade,
  transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique(obligation_id, transaction_id)
);

create unique index if not exists fundraising_contributions_transaction_uidx
  on public.fundraising_contributions(transaction_id) where transaction_id is not null;

-- First-class facility marketplace records. Booking payments use transaction_type=facility.
create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  stripe_account_id text,
  name text not null,
  description text,
  address text,
  cancellation_policy text,
  cancellation_window_hours integer not null default 24,
  late_cancellation_fee_cents integer not null default 0,
  minimum_minutes integer not null default 60 check (minimum_minutes > 0),
  advance_notice_hours integer not null default 24 check (advance_notice_hours >= 0),
  marketplace_fee_rate numeric(5,4) not null default 0.10,
  marketplace_fee_cap_cents integer not null default 7500,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.facility_spaces (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  name text not null,
  hourly_rate_cents integer not null check (hourly_rate_cents > 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.facility_bookings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  space_id uuid not null references public.facility_spaces(id) on delete restrict,
  booked_by_user_id uuid references public.profiles(id) on delete set null,
  booked_by_org_id uuid references public.organizations(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  rate_per_hour_cents integer not null check (rate_per_hour_cents > 0),
  amount_cents integer not null check (amount_cents > 0),
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','canceled','completed','refunded')),
  cancellation_fee_cents integer not null default 0,
  refunded_amount_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create extension if not exists btree_gist;
alter table public.facility_bookings drop constraint if exists facility_bookings_no_overlap;
alter table public.facility_bookings add constraint facility_bookings_no_overlap
  exclude using gist (space_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('pending','confirmed'));

alter table public.org_fee_reminders
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_error text,
  add column if not exists idempotency_key text;
create unique index if not exists org_fee_reminders_idempotency_uidx
  on public.org_fee_reminders(idempotency_key) where idempotency_key is not null;

create table if not exists public.payment_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  source_type text not null,
  source_id uuid not null,
  reminder_type text not null,
  recipient_email text not null,
  delivery_status text not null default 'pending',
  delivered_at timestamptz,
  delivery_error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
alter table public.payment_reminder_deliveries enable row level security;
create policy payment_reminders_member_read on public.payment_reminder_deliveries for select using (
  user_id=auth.uid() or exists(select 1 from public.organization_memberships m where m.org_id=payment_reminder_deliveries.org_id and m.user_id=auth.uid())
);
revoke insert,update,delete on public.payment_reminder_deliveries from authenticated,anon;
grant select on public.payment_reminder_deliveries to authenticated;
grant all on public.payment_reminder_deliveries to service_role;

alter table public.org_dues_retry_attempts enable row level security;
alter table public.org_event_obligations enable row level security;
alter table public.org_event_payment_allocations enable row level security;
alter table public.facilities enable row level security;
alter table public.facility_spaces enable row level security;
alter table public.facility_bookings enable row level security;

create policy facilities_public_read on public.facilities for select using (active or owner_user_id = auth.uid());
create policy facility_spaces_public_read on public.facility_spaces for select using (
  active and exists(select 1 from public.facilities f where f.id=facility_spaces.facility_id and f.active)
);
create policy facility_bookings_buyer_read on public.facility_bookings for select using (
  booked_by_user_id=auth.uid() or exists(select 1 from public.facilities f where f.id=facility_bookings.facility_id and f.owner_user_id=auth.uid())
);

revoke insert, update, delete on public.org_dues_retry_attempts, public.org_event_obligations,
  public.org_event_payment_allocations, public.facilities, public.facility_spaces, public.facility_bookings
  from authenticated, anon;
grant select on public.org_dues_retry_attempts, public.org_event_obligations,
  public.org_event_payment_allocations, public.facilities, public.facility_spaces, public.facility_bookings
  to authenticated;
grant all on public.org_dues_retry_attempts, public.org_event_obligations,
  public.org_event_payment_allocations, public.facilities, public.facility_spaces, public.facility_bookings
  to service_role;

-- Backfill every Connect-accounted payment into the unified ledger.
insert into public.payment_transactions (
  transaction_type,status,source_record_type,source_record_id,description,
  gross_amount_cents,amount_cents,platform_fee_cents,stripe_processing_fee_cents,
  net_amount_cents,net_cents,currency,stripe_payment_intent_id,occurred_at,metadata
)
select
  case
    when lower(a.checkout_type) ~ '(registration|tryout|program|enrollment)' then 'registration'
    when lower(a.checkout_type) ~ '(dues|org_fee|fee)' then 'dues'
    when lower(a.checkout_type) ~ '(event|tournament|camp|clinic)' then 'event'
    when lower(a.checkout_type) ~ '(facility|booking)' then 'facility'
    when lower(a.checkout_type) ~ '(fundrais|donation)' then 'fundraising'
    when lower(a.checkout_type) ~ '(equipment|marketplace|cart|order)' then 'equipment'
    when lower(a.checkout_type) ~ 'travel' then 'travel'
    else 'other'
  end,
  'succeeded',a.checkout_type,a.payment_record_id,'Migrated ' || replace(a.checkout_type,'_',' '),
  a.gross_amount_cents,a.gross_amount_cents,a.platform_fee_cents,
  nullif(a.stripe_metadata->>'stripeProcessingFeeCents','')::bigint,
  a.net_amount_cents,a.net_amount_cents,a.currency,a.stripe_payment_intent_id,a.created_at,
  a.stripe_metadata || jsonb_build_object('legacy_accounting_id',a.id)
from public.stripe_connect_payment_accounting a
on conflict do nothing;

-- Receipts cover successful legacy payments that predate Connect accounting.
insert into public.payment_transactions (
  transaction_type,status,org_id,payer_id,source_record_type,source_record_id,description,
  gross_amount_cents,amount_cents,platform_fee_cents,net_amount_cents,net_cents,currency,
  stripe_payment_intent_id,stripe_charge_id,occurred_at,metadata
)
select
  case
    when lower(coalesce(r.metadata->>'source','')) ~ '(registration|tryout|program|enrollment)' then 'registration'
    when lower(coalesce(r.metadata->>'source','')) ~ '(dues|org_fee|fee)' then 'dues'
    when lower(coalesce(r.metadata->>'source','')) ~ '(event|tournament|camp|clinic)' then 'event'
    when lower(coalesce(r.metadata->>'source','')) ~ '(facility|booking)' then 'facility'
    when lower(coalesce(r.metadata->>'source','')) ~ '(fundrais|donation)' then 'fundraising'
    when lower(coalesce(r.metadata->>'source','')) ~ '(equipment|marketplace|cart|order)' then 'equipment'
    when lower(coalesce(r.metadata->>'source','')) ~ 'travel' then 'travel'
    else 'other'
  end,
  case when lower(r.status) in ('paid','succeeded','complete','completed') then 'succeeded' when lower(r.status)='refunded' then 'refunded' else 'pending' end,
  r.org_id,r.payer_id,'payment_receipt',r.id,coalesce(r.metadata->>'description','Migrated payment receipt'),
  r.amount_cents,r.amount_cents,coalesce(nullif(r.metadata->>'platform_fee_cents','')::bigint,round(coalesce((r.metadata->>'platform_fee')::numeric,0)*100)),
  coalesce(nullif(r.metadata->>'net_amount_cents','')::bigint,r.amount_cents),coalesce(nullif(r.metadata->>'net_amount_cents','')::bigint,r.amount_cents),
  r.currency,r.stripe_payment_intent_id,r.stripe_charge_id,r.created_at,r.metadata || jsonb_build_object('legacy_receipt_id',r.id)
from public.payment_receipts r
where r.amount_cents is not null
on conflict do nothing;
