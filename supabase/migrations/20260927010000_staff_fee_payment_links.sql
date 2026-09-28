-- Expiring, revocable, auditable payment links shared by organization and league fees.
create table if not exists public.fee_payment_links (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('organization','league')),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  league_id uuid references public.leagues(id) on delete cascade,
  assignment_id uuid not null,
  intended_payer_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  idempotency_key text not null,
  status text not null default 'active' check (status in ('active','checkout_open','paid','expired','revoked','failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_type='organization' and organization_id is not null and league_id is null)
      or (owner_type='league' and league_id is not null and organization_id is null)),
  unique (owner_type, assignment_id, idempotency_key)
);

create index if not exists fee_payment_links_assignment_idx
  on public.fee_payment_links(owner_type,assignment_id,status);
create index if not exists fee_payment_links_expiry_idx
  on public.fee_payment_links(expires_at) where status in ('active','checkout_open');

create table if not exists public.fee_payment_link_audit_events (
  id uuid primary key default gen_random_uuid(),
  payment_link_id uuid references public.fee_payment_links(id) on delete set null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  league_id uuid references public.leagues(id) on delete cascade,
  assignment_id uuid not null,
  request_id uuid not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists fee_payment_link_audit_assignment_idx
  on public.fee_payment_link_audit_events(assignment_id,occurred_at desc);

alter table public.fee_payment_links enable row level security;
alter table public.fee_payment_link_audit_events enable row level security;
-- Service-role backend only. Public and authenticated clients receive no direct table policy.

alter table public.org_fee_assignments
  add column if not exists payment_link_checkout_claimed_at timestamptz;

alter table public.org_fee_assignments drop constraint if exists org_fee_assignments_status_check;
alter table public.org_fee_assignments add constraint org_fee_assignments_status_check
  check (status in ('unpaid','pending','processing','paid','failed','expired','canceled','void','waived','refunded','disputed'));

alter table public.league_fee_assignments
  add column if not exists payment_link_checkout_claimed_at timestamptz;

create or replace function public.claim_fee_payment_link_checkout(
  p_link_id uuid,
  p_token_hash text
) returns public.fee_payment_links
language plpgsql security definer set search_path=public as $$
declare l public.fee_payment_links; current_status text;
begin
  select * into l from public.fee_payment_links
    where id=p_link_id and token_hash=p_token_hash for update;
  if l.id is null or l.status not in ('active','checkout_open') or l.revoked_at is not null or l.expires_at <= now() then
    raise exception 'payment_link_unavailable';
  end if;
  if l.status='checkout_open' and l.stripe_checkout_session_id is not null then
    return l;
  end if;
  if l.owner_type='organization' then
    select status into current_status from public.org_fee_assignments where id=l.assignment_id for update;
    if current_status is null or current_status not in ('unpaid','pending','failed','expired') then
      raise exception 'assignment_unavailable';
    end if;
    update public.org_fee_assignments set payment_link_checkout_claimed_at=now(),status='processing' where id=l.assignment_id;
  else
    select status into current_status from public.league_fee_assignments where id=l.assignment_id for update;
    if current_status is null or current_status not in ('unpaid','partial') then
      raise exception 'assignment_unavailable';
    end if;
    update public.league_fee_assignments set payment_link_checkout_claimed_at=now(),status='processing',updated_at=now() where id=l.assignment_id;
  end if;
  update public.fee_payment_links set status='checkout_open',updated_at=now() where id=l.id returning * into l;
  return l;
end $$;
revoke all on function public.claim_fee_payment_link_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_fee_payment_link_checkout(uuid,text) to service_role;

create or replace function public.claim_org_fee_assignment_checkout(p_assignment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_status text;
begin
  select status into current_status from public.org_fee_assignments where id=p_assignment_id for update;
  if current_status is null or current_status not in ('unpaid','pending','failed','expired') then return false; end if;
  update public.org_fee_assignments set status='processing',payment_link_checkout_claimed_at=now(),updated_at=now() where id=p_assignment_id;
  return true;
end $$;

create or replace function public.claim_league_fee_assignment_checkout(p_assignment_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_status text;
begin
  select status into current_status from public.league_fee_assignments where id=p_assignment_id for update;
  if current_status is null or current_status not in ('unpaid','partial') then return false; end if;
  update public.league_fee_assignments set status='processing',payment_link_checkout_claimed_at=now(),updated_at=now() where id=p_assignment_id;
  return true;
end $$;

revoke all on function public.claim_org_fee_assignment_checkout(uuid),public.claim_league_fee_assignment_checkout(uuid) from public,anon,authenticated;
grant execute on function public.claim_org_fee_assignment_checkout(uuid),public.claim_league_fee_assignment_checkout(uuid) to service_role;
