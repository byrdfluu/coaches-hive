-- Payments as the core product: additive, cents-based shared ledger and collection models.
-- Existing receipts, assignments, subscriptions, and Stripe IDs are intentionally preserved.

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in (
    'registration','dues','event','facility','fundraising','equipment','travel','other'
  )),
  status text not null default 'pending' check (status in (
    'pending','processing','succeeded','failed','partially_refunded','refunded','waived','paid_off_platform','canceled'
  )),
  org_id uuid references public.organizations(id) on delete set null,
  payer_id uuid references public.profiles(id) on delete set null,
  player_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.org_teams(id) on delete set null,
  season_id uuid,
  source_record_type text,
  source_record_id uuid,
  description text not null,
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  stripe_processing_fee_cents bigint check (stripe_processing_fee_cents is null or stripe_processing_fee_cents >= 0),
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  refunded_amount_cents bigint not null default 0 check (refunded_amount_cents >= 0),
  currency text not null default 'usd' check (currency = lower(currency)),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_invoice_id text,
  payment_method_brand text,
  payment_method_last4 text check (payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'),
  failure_code text,
  failure_message text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform_fee_cents <= gross_amount_cents),
  check (refunded_amount_cents <= gross_amount_cents)
);

create unique index if not exists payment_transactions_payment_intent_uidx
  on public.payment_transactions(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists payment_transactions_org_date_idx
  on public.payment_transactions(org_id, occurred_at desc);
create index if not exists payment_transactions_payer_date_idx
  on public.payment_transactions(payer_id, occurred_at desc);
create index if not exists payment_transactions_type_date_idx
  on public.payment_transactions(transaction_type, occurred_at desc);
create index if not exists payment_transactions_source_idx
  on public.payment_transactions(source_record_type, source_record_id);

alter table public.payment_transactions enable row level security;
drop policy if exists payment_transactions_visible on public.payment_transactions;
create policy payment_transactions_visible on public.payment_transactions for select using (
  payer_id = auth.uid()
  or player_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.organization_memberships membership
    where membership.org_id = payment_transactions.org_id
      and membership.user_id = auth.uid()
      and coalesce(membership.status, 'active') = 'active'
  )
);
revoke insert, update, delete on public.payment_transactions from authenticated, anon;
grant select on public.payment_transactions to authenticated;
grant all on public.payment_transactions to service_role;

-- Registration pricing, source attribution, and attached waiver requirements.
alter table if exists public.org_enrollment_forms
  add column if not exists early_bird_fee_cents integer,
  add column if not exists early_bird_deadline timestamptz,
  add column if not exists late_fee_cents integer,
  add column if not exists late_fee_starts_at timestamptz,
  add column if not exists bundle_config jsonb not null default '{}'::jsonb,
  add column if not exists required_waiver_ids uuid[] not null default '{}';

alter table if exists public.org_enrollment_submissions
  add column if not exists player_id uuid references public.profiles(id) on delete set null,
  add column if not exists family_account_id uuid references public.profiles(id) on delete set null,
  add column if not exists amount_paid_cents integer,
  add column if not exists pricing_phase text check (pricing_phase in ('early_bird','standard','late')),
  add column if not exists registration_source text check (registration_source in ('direct_link','referral','in_app')),
  add column if not exists payment_method_brand text,
  add column if not exists payment_method_last4 text,
  add column if not exists signed_waiver_ids uuid[] not null default '{}';

create unique index if not exists org_team_members_team_athlete_uidx
  on public.org_team_members(team_id, athlete_id);

-- Recurring dues schedules and generated installments. Stripe remains the card vault.
create table if not exists public.org_dues_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  title text not null,
  amount_cents integer not null check (amount_cents > 0),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','annual')),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.org_dues_installments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.org_dues_schedules(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  family_account_id uuid references public.profiles(id) on delete set null,
  sequence_number integer not null check (sequence_number > 0),
  due_at timestamptz not null,
  amount_due_cents integer not null check (amount_due_cents > 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  status text not null default 'upcoming' check (status in ('upcoming','due','processing','paid','past_due','waived','paid_off_platform','failed')),
  autopay boolean not null default false,
  retry_count integer not null default 0 check (retry_count >= 0),
  last_retry_at timestamptz,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_payment_intent_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_id, player_id, sequence_number)
);

-- Event collections support player splits and partial payment totals.
create table if not exists public.org_event_collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  name text not null,
  event_type text not null check (event_type in ('tournament','showcase','camp','clinic','training','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  total_cost_cents integer not null check (total_cost_cents >= 0),
  split_player_count integer check (split_player_count is null or split_player_count > 0),
  per_player_amount_cents integer check (per_player_amount_cents is null or per_player_amount_cents >= 0),
  payment_deadline timestamptz,
  slug text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

-- Shareable fundraising campaigns. Contributions are recorded in payment_transactions.
create table if not exists public.fundraising_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  name text not null,
  description text,
  goal_amount_cents integer not null check (goal_amount_cents > 0),
  deadline timestamptz,
  suggested_amounts_cents integer[] not null default '{}',
  is_tax_deductible boolean not null default false,
  slug text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fundraising_contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  contributor_id uuid references public.profiles(id) on delete set null,
  contributor_name text,
  contributor_email text,
  contributor_type text not null check (contributor_type in ('parent','business','external_individual')),
  amount_cents integer not null check (amount_cents > 0),
  anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.org_dues_schedules enable row level security;
alter table public.org_dues_installments enable row level security;
alter table public.org_event_collections enable row level security;
alter table public.fundraising_campaigns enable row level security;
alter table public.fundraising_contributions enable row level security;

-- Mutations run through authorized server routes; members receive scoped read access.
do $$
declare table_name text;
begin
  foreach table_name in array array['org_dues_schedules','org_event_collections','fundraising_campaigns'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_member_read', table_name);
    execute format(
      'create policy %I on public.%I for select using (exists (select 1 from public.organization_memberships m where m.org_id = %I.org_id and m.user_id = auth.uid() and coalesce(m.status, ''active'') = ''active''))',
      table_name || '_member_read', table_name, table_name
    );
  end loop;
end $$;

create policy org_dues_installments_member_read on public.org_dues_installments for select using (
  player_id = auth.uid() or family_account_id = auth.uid() or exists (
    select 1 from public.org_dues_schedules schedule
    join public.organization_memberships membership on membership.org_id = schedule.org_id
    where schedule.id = org_dues_installments.schedule_id and membership.user_id = auth.uid()
  )
);
create policy fundraising_contributions_member_read on public.fundraising_contributions for select using (
  contributor_id = auth.uid() or exists (
    select 1 from public.fundraising_campaigns campaign
    join public.organization_memberships membership on membership.org_id = campaign.org_id
    where campaign.id = fundraising_contributions.campaign_id and membership.user_id = auth.uid()
  )
);

revoke insert, update, delete on public.org_dues_schedules, public.org_dues_installments,
  public.org_event_collections, public.fundraising_campaigns, public.fundraising_contributions
  from authenticated, anon;
grant select on public.org_dues_schedules, public.org_dues_installments,
  public.org_event_collections, public.fundraising_campaigns, public.fundraising_contributions
  to authenticated;
grant all on public.org_dues_schedules, public.org_dues_installments,
  public.org_event_collections, public.fundraising_campaigns, public.fundraising_contributions
  to service_role;
