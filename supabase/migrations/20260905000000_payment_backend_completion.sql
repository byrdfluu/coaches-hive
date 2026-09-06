-- Complete the mobile payment contract with auditable refunds and first-class
-- equipment/travel collections. All monetary values are integer cents.

alter table if exists public.payment_refund_requests
  add column if not exists requested_amount_cents bigint,
  add column if not exists refunded_amount_cents bigint not null default 0,
  add column if not exists stripe_refund_status text,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists audit_metadata jsonb not null default '{}'::jsonb;

update public.payment_refund_requests
set requested_amount_cents = round(amount * 100)
where requested_amount_cents is null;

alter table if exists public.payment_refund_requests
  alter column requested_amount_cents set not null,
  drop constraint if exists payment_refund_requests_requested_amount_cents_check,
  add constraint payment_refund_requests_requested_amount_cents_check check (requested_amount_cents > 0),
  drop constraint if exists payment_refund_requests_refunded_amount_cents_check,
  add constraint payment_refund_requests_refunded_amount_cents_check
    check (refunded_amount_cents >= 0 and refunded_amount_cents <= requested_amount_cents);

create or replace function public.sync_refund_request_cents()
returns trigger language plpgsql set search_path = public as $$
begin
  new.requested_amount_cents := coalesce(new.requested_amount_cents, round(new.amount * 100));
  return new;
end;
$$;
drop trigger if exists sync_refund_request_cents_trigger on public.payment_refund_requests;
create trigger sync_refund_request_cents_trigger
before insert or update on public.payment_refund_requests
for each row execute function public.sync_refund_request_cents();

create or replace function public.record_refund_request_state(
  p_request_id uuid,
  p_status text,
  p_stripe_refund_id text default null,
  p_stripe_refund_status text default null,
  p_refunded_amount_cents bigint default null,
  p_resolution_note text default null,
  p_approved_by uuid default null,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns public.payment_refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_refund_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('requested','under_review','approved','rejected','processing','refunded','failed','canceled') then
    raise exception 'Unsupported refund status';
  end if;

  select * into v_row from public.payment_refund_requests where id = p_request_id for update;
  if not found then raise exception 'Refund request not found'; end if;

  if v_row.status = 'refunded' and p_status <> 'refunded' then
    return v_row;
  end if;

  update public.payment_refund_requests
  set status = p_status,
      stripe_refund_id = coalesce(p_stripe_refund_id, stripe_refund_id),
      stripe_refund_status = coalesce(p_stripe_refund_status, stripe_refund_status),
      refunded_amount_cents = coalesce(p_refunded_amount_cents, refunded_amount_cents),
      resolution_note = coalesce(p_resolution_note, resolution_note),
      approved_by = coalesce(p_approved_by, approved_by),
      approved_at = case when p_approved_by is not null then coalesce(approved_at, v_now) else approved_at end,
      audit_metadata = coalesce(audit_metadata, '{}'::jsonb) || coalesce(p_audit_metadata, '{}'::jsonb),
      resolved_at = case when p_status in ('rejected','refunded','failed','canceled') then coalesce(resolved_at, v_now) else null end,
      updated_at = v_now
  where id = p_request_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.record_refund_request_state(uuid,text,text,text,bigint,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_refund_request_state(uuid,text,text,text,bigint,text,uuid,jsonb) to service_role;

create table if not exists public.org_payment_collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  collection_type text not null check (collection_type in ('equipment','travel')),
  title text not null,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  due_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_payment_collection_obligations (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.org_payment_collections(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  family_account_id uuid references public.profiles(id) on delete set null,
  amount_due_cents integer not null check (amount_due_cents > 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','waived','paid_off_platform')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(collection_id, player_id)
);

create table if not exists public.org_payment_collection_allocations (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.org_payment_collection_obligations(id) on delete cascade,
  transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique(obligation_id, transaction_id)
);

create index if not exists org_payment_collections_org_type_idx
  on public.org_payment_collections(org_id, collection_type, created_at desc);
create index if not exists org_payment_collection_obligations_player_idx
  on public.org_payment_collection_obligations(player_id, created_at desc);

create or replace function public.complete_org_payment_collection_obligation(
  p_obligation_id uuid,
  p_transaction_id uuid,
  p_amount_cents integer
)
returns public.org_payment_collection_obligations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.org_payment_collection_obligations%rowtype;
  v_inserted integer;
  v_paid integer;
begin
  if p_amount_cents <= 0 then raise exception 'Payment amount must be positive'; end if;
  select * into v_row from public.org_payment_collection_obligations where id = p_obligation_id for update;
  if not found then raise exception 'Collection obligation not found'; end if;

  insert into public.org_payment_collection_allocations(obligation_id, transaction_id, amount_cents)
  values (p_obligation_id, p_transaction_id, p_amount_cents)
  on conflict (obligation_id, transaction_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    v_paid := least(v_row.amount_due_cents, v_row.amount_paid_cents + p_amount_cents);
    update public.org_payment_collection_obligations
    set amount_paid_cents = v_paid,
        status = case when v_paid >= amount_due_cents then 'paid' else 'partial' end,
        updated_at = clock_timestamp()
    where id = p_obligation_id
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on function public.complete_org_payment_collection_obligation(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.complete_org_payment_collection_obligation(uuid,uuid,integer) to service_role;

alter table public.org_payment_collections enable row level security;
alter table public.org_payment_collection_obligations enable row level security;
alter table public.org_payment_collection_allocations enable row level security;

create policy org_payment_collections_member_read on public.org_payment_collections for select using (
  exists(select 1 from public.organization_memberships m where m.org_id=org_payment_collections.org_id and m.user_id=auth.uid() and coalesce(m.status,'active')='active')
);
create policy org_payment_collection_obligations_member_read on public.org_payment_collection_obligations for select using (
  player_id=auth.uid() or family_account_id=auth.uid() or exists(
    select 1 from public.org_payment_collections c join public.organization_memberships m on m.org_id=c.org_id
    where c.id=org_payment_collection_obligations.collection_id and m.user_id=auth.uid() and coalesce(m.status,'active')='active'
  )
);
create policy org_payment_collection_allocations_member_read on public.org_payment_collection_allocations for select using (
  exists(select 1 from public.org_payment_collection_obligations o where o.id=org_payment_collection_allocations.obligation_id and (o.player_id=auth.uid() or o.family_account_id=auth.uid()))
);

revoke insert,update,delete on public.org_payment_collections, public.org_payment_collection_obligations,
  public.org_payment_collection_allocations from authenticated,anon;
grant select on public.org_payment_collections, public.org_payment_collection_obligations,
  public.org_payment_collection_allocations to authenticated;
grant all on public.org_payment_collections, public.org_payment_collection_obligations,
  public.org_payment_collection_allocations to service_role;
