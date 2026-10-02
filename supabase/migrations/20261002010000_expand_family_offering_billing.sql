-- Add explicit billing semantics to family-facing offerings without changing
-- any existing paid offering into a subscription.

-- Deterministically attribute legacy coach Connect rows when the coach owns
-- exactly one active independent workspace. Ambiguous rows remain untouched
-- and the API safely refuses to issue an Express login link for them.
update public.stripe_connect_accounts account
set workspace_id = (
  select workspace.id
  from public.business_workspaces workspace
  where workspace.workspace_type = 'independent_coach'
    and workspace.status = 'active'
    and workspace.owner_user_id = account.owner_id
  order by workspace.id
  limit 1
)
where account.owner_type = 'coach'
  and account.workspace_id is null
  and 1 = (
    select count(*)
    from public.business_workspaces workspace
    where workspace.workspace_type = 'independent_coach'
      and workspace.status = 'active'
      and workspace.owner_user_id = account.owner_id
  );

alter table if exists public.programs
  add column if not exists billing_type text,
  add column if not exists billing_interval text,
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table if exists public.org_tryouts
  add column if not exists billing_type text,
  add column if not exists billing_interval text,
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table if exists public.sessions
  add column if not exists billing_type text,
  add column if not exists billing_interval text,
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table if exists public.marketplace_items
  add column if not exists billing_type text,
  add column if not exists billing_interval text,
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

update public.programs
set billing_type = case when coalesce(price, 0) > 0 then 'one_time' else 'free' end,
    billing_interval = null
where billing_type is null;

update public.org_tryouts
set billing_type = case when coalesce(price, 0) > 0 then 'one_time' else 'free' end,
    billing_interval = null
where billing_type is null;

update public.sessions
set billing_type = case when coalesce(price_cents, round(coalesce(price, 0) * 100), 0) > 0 then 'one_time' else 'free' end,
    billing_interval = null
where billing_type is null;

update public.marketplace_items
set billing_type = case when coalesce(price, 0) > 0 then 'one_time' else 'free' end,
    billing_interval = null
where billing_type is null;

alter table public.programs alter column billing_type set not null;
alter table public.org_tryouts alter column billing_type set not null;
alter table public.sessions alter column billing_type set not null;
alter table public.marketplace_items alter column billing_type set not null;

create or replace function public.normalize_family_offering_billing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  row_data jsonb := to_jsonb(new);
  amount_cents numeric;
begin
  amount_cents := case
    when nullif(row_data->>'price_cents','') is not null then (row_data->>'price_cents')::numeric
    else coalesce(nullif(row_data->>'price','')::numeric, 0) * 100
  end;
  if new.billing_type is null or btrim(new.billing_type) = '' then
    new.billing_type := case when amount_cents > 0 then 'one_time' else 'free' end;
  end if;
  if new.billing_type <> 'recurring' then new.billing_interval := null; end if;
  return new;
end;
$$;

drop trigger if exists programs_normalize_billing on public.programs;
create trigger programs_normalize_billing before insert or update of price,billing_type,billing_interval on public.programs
for each row execute function public.normalize_family_offering_billing();
drop trigger if exists org_tryouts_normalize_billing on public.org_tryouts;
create trigger org_tryouts_normalize_billing before insert or update of price,billing_type,billing_interval on public.org_tryouts
for each row execute function public.normalize_family_offering_billing();
drop trigger if exists sessions_normalize_billing on public.sessions;
create trigger sessions_normalize_billing before insert or update of price,price_cents,billing_type,billing_interval on public.sessions
for each row execute function public.normalize_family_offering_billing();
drop trigger if exists marketplace_items_normalize_billing on public.marketplace_items;
create trigger marketplace_items_normalize_billing before insert or update of price,billing_type,billing_interval on public.marketplace_items
for each row execute function public.normalize_family_offering_billing();

alter table public.programs drop constraint if exists programs_billing_contract_check;
alter table public.programs add constraint programs_billing_contract_check check (
  billing_type in ('free','one_time','recurring') and
  ((billing_type = 'recurring' and billing_interval in ('month','year') and coalesce(price,0) > 0)
    or (billing_type = 'one_time' and billing_interval is null and coalesce(price,0) > 0)
    or (billing_type = 'free' and billing_interval is null and coalesce(price,0) <= 0))
);

alter table public.org_tryouts drop constraint if exists org_tryouts_billing_contract_check;
alter table public.org_tryouts add constraint org_tryouts_billing_contract_check check (
  billing_type in ('free','one_time','recurring') and
  ((billing_type = 'recurring' and billing_interval in ('month','year') and coalesce(price,0) > 0)
    or (billing_type = 'one_time' and billing_interval is null and coalesce(price,0) > 0)
    or (billing_type = 'free' and billing_interval is null and coalesce(price,0) <= 0))
);

alter table public.sessions drop constraint if exists sessions_billing_contract_check;
alter table public.sessions add constraint sessions_billing_contract_check check (
  billing_type in ('free','one_time','recurring') and
  ((billing_type = 'recurring' and billing_interval in ('month','year') and coalesce(price_cents,round(coalesce(price,0)*100),0) > 0)
    or (billing_type = 'one_time' and billing_interval is null and coalesce(price_cents,round(coalesce(price,0)*100),0) > 0)
    or (billing_type = 'free' and billing_interval is null and coalesce(price_cents,round(coalesce(price,0)*100),0) <= 0))
);

alter table public.marketplace_items drop constraint if exists marketplace_items_billing_contract_check;
alter table public.marketplace_items add constraint marketplace_items_billing_contract_check check (
  billing_type in ('free','one_time','recurring') and
  ((billing_type = 'recurring' and billing_interval in ('month','year') and coalesce(price,0) > 0)
    or (billing_type = 'one_time' and billing_interval is null and coalesce(price,0) > 0)
    or (billing_type = 'free' and billing_interval is null and coalesce(price,0) <= 0))
);

alter table if exists public.program_registrations add column if not exists stripe_subscription_id text;
alter table if exists public.org_tryout_registrations add column if not exists stripe_subscription_id text;

create table if not exists public.offering_recurring_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete restrict,
  organization_id uuid not null,
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete restrict,
  purchaser_user_id uuid not null references public.profiles(id) on delete restrict,
  offering_type text not null check (offering_type in ('program','tryout','session','marketplace_product')),
  offering_id uuid not null,
  registration_id uuid,
  billing_interval text not null check (billing_interval in ('month','year')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'checkout_pending' check (status in ('checkout_pending','trialing','active','past_due','paused','canceled','unpaid','incomplete','incomplete_expired','expired')),
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists offering_recurring_active_uidx
  on public.offering_recurring_subscriptions(athlete_profile_id,offering_type,offering_id)
  where status in ('checkout_pending','trialing','active','past_due','paused','incomplete');

create index if not exists offering_recurring_subscription_stripe_idx
  on public.offering_recurring_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.offering_recurring_subscriptions enable row level security;
drop policy if exists offering_recurring_subscriptions_read_own on public.offering_recurring_subscriptions;
create policy offering_recurring_subscriptions_read_own on public.offering_recurring_subscriptions
  for select to authenticated using (purchaser_user_id = auth.uid());

notify pgrst, 'reload schema';
