-- Workspace-owned platform subscriptions and durable mobile clickwrap consent.
alter table public.platform_subscriptions
  drop constraint if exists platform_subscriptions_owner_type_check;

alter table public.platform_subscriptions
  add constraint platform_subscriptions_owner_type_check
  check (owner_type in ('coach', 'athlete', 'org', 'league'));

alter table public.platform_subscriptions
  add column if not exists league_id uuid references public.leagues(id) on delete cascade,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists canceled_at timestamptz;

create index if not exists platform_subscriptions_league_idx
  on public.platform_subscriptions(league_id, status);
create unique index if not exists platform_subscriptions_checkout_session_uidx
  on public.platform_subscriptions(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

drop policy if exists "platform subscriptions read own" on public.platform_subscriptions;
create policy "platform subscriptions read own"
on public.platform_subscriptions for select to authenticated using (
  user_id = auth.uid()
  or (organization_id is not null and exists (
    select 1 from public.organization_memberships om
    where om.org_id = platform_subscriptions.organization_id
      and om.user_id = auth.uid() and om.status = 'active'
  ))
  or (league_id is not null and exists (
    select 1 from public.league_memberships lm
    where lm.league_id = platform_subscriptions.league_id
      and lm.user_id = auth.uid() and lm.status = 'active'
  ))
);

create table if not exists public.workspace_subscription_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  owner_type text not null check(owner_type in ('org','league')),
  owner_id uuid not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  league_id uuid references public.leagues(id) on delete cascade,
  accepted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  submitted_agreement_version text not null,
  canonical_agreement_version text not null,
  authority_confirmed boolean not null check(authority_confirmed),
  recurring_billing_confirmed boolean not null check(recurring_billing_confirmed),
  minor_data_responsibility_confirmed boolean not null check(minor_data_responsibility_confirmed),
  plan_key text not null,
  billing_interval text not null check(billing_interval in ('month','year')),
  price_cents bigint not null check(price_cents >= 0),
  stripe_checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  request_id text not null,
  ip_address text,
  user_agent text,
  accepted_at timestamptz not null default now(),
  check ((owner_type='org' and organization_id=owner_id and league_id is null)
    or (owner_type='league' and league_id=owner_id and organization_id is null))
);

create index if not exists workspace_subscription_consents_workspace_idx
  on public.workspace_subscription_consents(workspace_id, accepted_at desc);
alter table public.workspace_subscription_consents enable row level security;
revoke all on public.workspace_subscription_consents from public, anon, authenticated;
grant all on public.workspace_subscription_consents to service_role;

create table if not exists public.coach_athlete_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid references public.profiles(id) on delete set null,
  invite_token_hash text not null unique,
  status text not null default 'pending' check(status in ('pending','accepted','expired','revoked','delivery_failed')),
  email_delivery_status text not null default 'pending',
  email_delivery_attempted_at timestamptz,
  email_provider_message_id text,
  token_expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists coach_athlete_invitations_pending_uidx
  on public.coach_athlete_invitations(workspace_id, lower(invited_email)) where status='pending';
alter table public.coach_athlete_invitations enable row level security;
revoke all on public.coach_athlete_invitations from public, anon, authenticated;
grant all on public.coach_athlete_invitations to service_role;
