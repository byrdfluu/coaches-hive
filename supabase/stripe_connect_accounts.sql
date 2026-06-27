create table if not exists public.stripe_connect_accounts (
  id uuid primary key default gen_random_uuid()
);

alter table public.stripe_connect_accounts
  add column if not exists owner_type text,
  add column if not exists owner_id uuid,
  add column if not exists coach_id uuid references public.profiles(id) on delete cascade,
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists stripe_account_id text,
  add column if not exists account_type text not null default 'express',
  add column if not exists charges_enabled boolean not null default false,
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists details_submitted boolean not null default false,
  add column if not exists requirements_due text[] not null default '{}',
  add column if not exists disabled_reason text,
  add column if not exists connect_status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.stripe_connect_accounts
set
  owner_type = case
    when owner_type is null and coach_id is not null then 'coach'
    when owner_type is null and org_id is not null then 'org'
    else owner_type
  end,
  owner_id = coalesce(owner_id, coach_id, org_id),
  updated_at = now()
where owner_id is null
  or owner_type is null;

alter table public.stripe_connect_accounts
  drop constraint if exists stripe_connect_accounts_owner_type_check,
  drop constraint if exists stripe_connect_accounts_status_check,
  drop constraint if exists stripe_connect_accounts_owner_match,
  drop constraint if exists stripe_connect_accounts_stripe_account_unique,
  drop constraint if exists stripe_connect_accounts_owner_unique;

alter table public.stripe_connect_accounts
  add constraint stripe_connect_accounts_owner_type_check
    check (owner_type is null or owner_type in ('coach', 'org')) not valid,
  add constraint stripe_connect_accounts_status_check
    check (connect_status in ('pending', 'restricted', 'enabled')) not valid,
  add constraint stripe_connect_accounts_owner_match
    check (
      owner_id is null
      or (owner_type = 'coach' and coach_id = owner_id and org_id is null)
      or (owner_type = 'org' and org_id = owner_id and coach_id is null)
    ) not valid;

drop index if exists public.stripe_connect_accounts_owner_unique_idx;
create unique index if not exists stripe_connect_accounts_owner_unique_idx
  on public.stripe_connect_accounts(owner_type, owner_id);

create unique index if not exists stripe_connect_accounts_stripe_account_unique_idx
  on public.stripe_connect_accounts(stripe_account_id)
  where stripe_account_id is not null;

create index if not exists stripe_connect_accounts_coach_idx on public.stripe_connect_accounts(coach_id);
create index if not exists stripe_connect_accounts_org_idx on public.stripe_connect_accounts(org_id);
create index if not exists stripe_connect_accounts_status_idx on public.stripe_connect_accounts(connect_status);

alter table public.stripe_connect_accounts enable row level security;

drop policy if exists "stripe connect account owner read" on public.stripe_connect_accounts;
create policy "stripe connect account owner read" on public.stripe_connect_accounts
for select using (
  (owner_type = 'coach' and owner_id = auth.uid())
  or exists (
    select 1
    from public.organization_memberships m
    where m.org_id = stripe_connect_accounts.org_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  )
);

insert into public.stripe_connect_accounts (
  owner_type,
  owner_id,
  coach_id,
  org_id,
  stripe_account_id,
  connect_status
)
select
  'coach',
  p.id,
  p.id,
  null,
  p.stripe_account_id,
  'pending'
from public.profiles p
where p.stripe_account_id is not null
  and p.stripe_account_id <> ''
on conflict (owner_type, owner_id) do update set
  stripe_account_id = excluded.stripe_account_id,
  updated_at = now();

insert into public.stripe_connect_accounts (
  owner_type,
  owner_id,
  coach_id,
  org_id,
  stripe_account_id,
  connect_status
)
select
  'org',
  s.org_id,
  null,
  s.org_id,
  s.stripe_account_id,
  'pending'
from public.org_settings s
where s.stripe_account_id is not null
  and s.stripe_account_id <> ''
on conflict (owner_type, owner_id) do update set
  stripe_account_id = excluded.stripe_account_id,
  updated_at = now();
