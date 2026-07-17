-- Canonical, webhook-owned coach and organization platform subscriptions. Safe to rerun.
create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('coach', 'org')),
  owner_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  tier text,
  status text not null default 'incomplete' check (status in ('active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_type, owner_id)
);

alter table public.platform_subscriptions enable row level security;
drop policy if exists "platform subscriptions read own" on public.platform_subscriptions;
create policy "platform subscriptions read own" on public.platform_subscriptions for select using (
  user_id = auth.uid() or (organization_id is not null and exists (
    select 1 from public.organization_memberships om
    where om.org_id = platform_subscriptions.organization_id and om.user_id = auth.uid() and om.status = 'active'
  ))
);

-- Preserve valid legacy access; future changes are written by Stripe webhooks.
insert into public.platform_subscriptions(owner_type, owner_id, user_id, tier, status)
select 'coach', p.id, p.id, coalesce(cp.tier, p.plan_tier), 'active'
from public.profiles p left join public.coach_plans cp on cp.coach_id = p.id
where p.role = 'coach' and lower(coalesce(p.subscription_status, '')) = 'active'
  and coalesce(cp.tier, p.plan_tier) is not null
on conflict (owner_type, owner_id) do nothing;

insert into public.platform_subscriptions(owner_type, owner_id, user_id, organization_id, tier, status)
select distinct on (os.org_id) 'org', os.org_id, om.user_id, os.org_id, os.plan, 'active'
from public.org_settings os join public.organization_memberships om on om.org_id = os.org_id
where lower(coalesce(os.plan_status, '')) = 'active' and os.plan is not null
  and (om.status is null or om.status = 'active')
order by os.org_id, om.created_at asc
on conflict (owner_type, owner_id) do nothing;
