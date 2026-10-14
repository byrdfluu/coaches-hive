begin;

-- One configuration vocabulary for every dated program/event. Training
-- packages retain their existing credit ledger and map to credit_membership.
alter table public.programs
  add column if not exists fulfillment_mode text not null default 'series',
  add column if not exists price_per_occurrence numeric(10,2),
  add column if not exists credits_per_period integer,
  add column if not exists billing_interval text,
  add column if not exists renews_until_cancelled boolean not null default false,
  add column if not exists cancellation_cutoff_hours integer not null default 24;

alter table public.programs drop constraint if exists programs_fulfillment_mode_check;
alter table public.programs add constraint programs_fulfillment_mode_check
  check (fulfillment_mode in ('series','per_occurrence','credit_membership','free'));
alter table public.programs drop constraint if exists programs_billing_interval_check;
alter table public.programs add constraint programs_billing_interval_check
  check (billing_interval is null or billing_interval in ('month','year'));
alter table public.programs drop constraint if exists programs_credit_terms_check;
alter table public.programs add constraint programs_credit_terms_check check (
  (fulfillment_mode <> 'credit_membership') or
  (credits_per_period is not null and credits_per_period > 0 and billing_interval is not null)
);
alter table public.programs drop constraint if exists programs_per_occurrence_price_check;
alter table public.programs add constraint programs_per_occurrence_price_check check (
  price_per_occurrence is null or price_per_occurrence >= 0
);

alter table public.org_tryouts
  add column if not exists fulfillment_mode text not null default 'series',
  add column if not exists price_per_occurrence_cents integer,
  add column if not exists credits_per_period integer,
  add column if not exists billing_interval text,
  add column if not exists renews_until_cancelled boolean not null default false,
  add column if not exists cancellation_cutoff_hours integer not null default 24;

-- A registration is the entitlement/payment record. Its occurrence rows are
-- the dates the athlete selected, so one checkout can safely cover many dates.
create table if not exists public.org_offering_registration_occurrences (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  registration_type text not null check (registration_type in ('program','tryout')),
  occurrence_id uuid not null references public.org_offering_occurrences(id) on delete restrict,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','attended','cancelled','late_cancel','no_show')),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  credit_delta integer not null default 0,
  cancelled_at timestamptz,
  cancellation_reason text,
  credit_returned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_type, registration_id, occurrence_id)
);
create index if not exists org_offering_registration_occurrence_lookup_idx
  on public.org_offering_registration_occurrences(occurrence_id,status);
create index if not exists org_offering_registration_athlete_idx
  on public.org_offering_registration_occurrences(athlete_id,status);

alter table public.org_offering_registration_occurrences enable row level security;
drop policy if exists offering_registration_occurrences_read on public.org_offering_registration_occurrences;
create policy offering_registration_occurrences_read on public.org_offering_registration_occurrences
for select to authenticated using (
  exists(select 1 from public.athlete_profiles a where a.id=athlete_id and a.owner_user_id=auth.uid())
  or exists(select 1 from public.org_offering_occurrences o where o.id=occurrence_id and public.is_org_member(o.org_id))
  or public.is_admin(auth.uid())
);

create table if not exists public.org_offering_credit_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  offering_id uuid not null references public.programs(id) on delete restrict,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  purchaser_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','active','past_due','cancelled','expired')),
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists org_offering_credit_active_membership_uidx
  on public.org_offering_credit_memberships(offering_id,athlete_id)
  where status in ('pending','active','past_due');

create table if not exists public.org_offering_credit_cycles (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.org_offering_credit_memberships(id) on delete restrict,
  cycle_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  credits_granted integer not null check (credits_granted>0),
  stripe_invoice_id text,
  created_at timestamptz not null default now(),
  unique(membership_id,cycle_key),
  check(period_end>period_start)
);

create table if not exists public.org_offering_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.org_offering_credit_memberships(id) on delete restrict,
  cycle_id uuid not null references public.org_offering_credit_cycles(id) on delete restrict,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  occurrence_id uuid references public.org_offering_occurrences(id) on delete restrict,
  delta integer not null,
  reason text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists org_offering_credit_booking_debit_uidx
  on public.org_offering_credit_ledger(membership_id,occurrence_id)
  where reason='booking';

alter table public.org_offering_credit_memberships enable row level security;
alter table public.org_offering_credit_cycles enable row level security;
alter table public.org_offering_credit_ledger enable row level security;
create policy offering_credit_memberships_read on public.org_offering_credit_memberships for select to authenticated
  using (purchaser_user_id=auth.uid() or public.is_org_member(org_id) or public.is_admin(auth.uid()));
create policy offering_credit_cycles_read on public.org_offering_credit_cycles for select to authenticated
  using (exists(select 1 from public.org_offering_credit_memberships m where m.id=membership_id
    and (m.purchaser_user_id=auth.uid() or public.is_org_member(m.org_id) or public.is_admin(auth.uid()))));
create policy offering_credit_ledger_read on public.org_offering_credit_ledger for select to authenticated
  using (exists(select 1 from public.org_offering_credit_memberships m where m.id=membership_id
    and (m.purchaser_user_id=auth.uid() or public.is_org_member(m.org_id) or public.is_admin(auth.uid()))));

create or replace function public.activate_org_offering_credit_cycle(
  p_membership_id uuid, p_cycle_key text, p_period_start timestamptz,
  p_period_end timestamptz, p_stripe_invoice_id text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_membership public.org_offering_credit_memberships%rowtype; v_credits integer; v_cycle uuid;
begin
  if auth.role()<>'service_role' and not public.is_admin(auth.uid()) then raise exception 'Payment backend authorization required'; end if;
  select * into v_membership from public.org_offering_credit_memberships where id=p_membership_id for update;
  select credits_per_period into v_credits from public.programs where id=v_membership.offering_id;
  if coalesce(v_credits,0)<1 or p_period_end<=p_period_start then raise exception 'Invalid credit cycle'; end if;
  insert into public.org_offering_credit_cycles(membership_id,cycle_key,period_start,period_end,credits_granted,stripe_invoice_id)
    values(p_membership_id,p_cycle_key,p_period_start,p_period_end,v_credits,p_stripe_invoice_id)
    on conflict(membership_id,cycle_key) do nothing returning id into v_cycle;
  update public.org_offering_credit_memberships set status='active',current_period_start=p_period_start,
    current_period_end=p_period_end,updated_at=now() where id=p_membership_id;
  if v_cycle is not null then
    insert into public.org_offering_credit_ledger(membership_id,cycle_id,athlete_id,delta,reason,expires_at)
      values(p_membership_id,v_cycle,v_membership.athlete_id,v_credits,'renewal',p_period_end);
  else
    select id into v_cycle from public.org_offering_credit_cycles where membership_id=p_membership_id and cycle_key=p_cycle_key;
  end if;
  return v_cycle;
end $$;
revoke all on function public.activate_org_offering_credit_cycle(uuid,text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.activate_org_offering_credit_cycle(uuid,text,timestamptz,timestamptz,text) to service_role;

create or replace function public.select_family_offering_occurrences(
  p_registration_id uuid, p_offering_type text, p_occurrence_ids uuid[], p_athlete_id uuid
) returns uuid[] language plpgsql security definer set search_path=public as $$
declare
  v_occ public.org_offering_occurrences%rowtype;
  v_id uuid;
  v_count integer;
  v_registration_type text := case when p_offering_type='tryout' then 'tryout' else 'program' end;
  v_unit_price integer := 0;
  v_offering_id uuid;
  v_membership_id uuid;
  v_cycle_id uuid;
  v_credit_balance integer;
begin
  if coalesce(array_length(p_occurrence_ids,1),0)=0 then raise exception 'Choose at least one date and time'; end if;
  if array_length(p_occurrence_ids,1) <> (select count(distinct x) from unnest(p_occurrence_ids) x) then
    raise exception 'Duplicate dates are not allowed';
  end if;

  if v_registration_type='tryout' then
    select tryout_id into v_offering_id from public.org_tryout_registrations
      where id=p_registration_id and athlete_profile_id=p_athlete_id;
  else
    select program_id into v_offering_id from public.program_registrations
      where id=p_registration_id and athlete_profile_id=p_athlete_id;
  end if;
  if v_offering_id is null then raise exception 'Registration does not match this offering'; end if;

  foreach v_id in array p_occurrence_ids loop
    select * into v_occ from public.org_offering_occurrences where id=v_id for update;
    if v_occ.id is null or v_occ.status<>'published' or v_occ.starts_at<=now()
       or v_occ.offering_type<>p_offering_type or v_occ.offering_id<>v_offering_id then
      raise exception 'A selected date and time is no longer available';
    end if;
    select count(*) into v_count from public.org_offering_registration_occurrences
      where occurrence_id=v_id and status in ('reserved','attended');
    if v_occ.capacity is not null and v_count>=v_occ.capacity then raise exception 'A selected date and time is full'; end if;

    if v_registration_type='program' then
      select case when p.fulfillment_mode='per_occurrence'
        then round(coalesce(p.price_per_occurrence,p.price,0)*100)::integer else 0 end
      into v_unit_price from public.program_registrations r join public.programs p on p.id=r.program_id
      where r.id=p_registration_id;
      if exists(select 1 from public.programs where id=v_offering_id and fulfillment_mode='credit_membership') then
        select m.id,c.id into v_membership_id,v_cycle_id
        from public.org_offering_credit_memberships m join public.org_offering_credit_cycles c on c.membership_id=m.id
        where m.offering_id=v_offering_id and m.athlete_id=p_athlete_id and m.status='active'
          and c.period_start<=now() and c.period_end>now() order by c.period_end limit 1 for update of c;
        select coalesce(sum(l.delta),0) into v_credit_balance from public.org_offering_credit_ledger l
          where l.membership_id=v_membership_id and l.cycle_id=v_cycle_id and l.expires_at>now();
        if v_membership_id is null or v_credit_balance<1 then raise exception 'No current-period credits remain'; end if;
      end if;
    end if;
    insert into public.org_offering_registration_occurrences(
      registration_id,registration_type,occurrence_id,athlete_id,unit_price_cents,credit_delta
    ) values (p_registration_id,v_registration_type,v_id,p_athlete_id,v_unit_price,
      case when v_registration_type='program' and exists(
        select 1 from public.program_registrations r join public.programs p on p.id=r.program_id
        where r.id=p_registration_id and p.fulfillment_mode='credit_membership') then -1 else 0 end)
    on conflict (registration_type,registration_id,occurrence_id) do nothing;
    if v_membership_id is not null then
      insert into public.org_offering_credit_ledger(membership_id,cycle_id,athlete_id,occurrence_id,delta,reason,expires_at)
      select v_membership_id,v_cycle_id,p_athlete_id,v_id,-1,'booking',c.period_end
      from public.org_offering_credit_cycles c where c.id=v_cycle_id
      on conflict do nothing;
    end if;
  end loop;

  -- Keep the legacy pointer populated for old clients and reports.
  if v_registration_type='tryout' then
    update public.org_tryout_registrations set occurrence_id=p_occurrence_ids[1]
      where id=p_registration_id and athlete_profile_id=p_athlete_id;
  else
    update public.program_registrations set occurrence_id=p_occurrence_ids[1]
      where id=p_registration_id and athlete_profile_id=p_athlete_id;
  end if;
  return p_occurrence_ids;
end $$;
revoke all on function public.select_family_offering_occurrences(uuid,text,uuid[],uuid) from public,anon;
grant execute on function public.select_family_offering_occurrences(uuid,text,uuid[],uuid) to authenticated;

create or replace function public.cancel_family_offering_occurrence(
  p_selection_id uuid, p_reason text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_row public.org_offering_registration_occurrences%rowtype; v_occ public.org_offering_occurrences%rowtype;
  v_cutoff integer:=24; v_return boolean:=false; v_debit public.org_offering_credit_ledger%rowtype;
begin
  select * into v_row from public.org_offering_registration_occurrences where id=p_selection_id for update;
  if v_row.id is null or v_row.status<>'reserved' then raise exception 'This booking cannot be cancelled'; end if;
  select * into v_occ from public.org_offering_occurrences where id=v_row.occurrence_id;
  if not (exists(select 1 from public.athlete_profiles a where a.id=v_row.athlete_id and a.owner_user_id=auth.uid())
    or public.is_org_member(v_occ.org_id) or public.is_admin(auth.uid())) then raise exception 'Not authorized'; end if;
  if v_row.registration_type='program' then
    select coalesce(p.cancellation_cutoff_hours,24) into v_cutoff
      from public.program_registrations r join public.programs p on p.id=r.program_id where r.id=v_row.registration_id;
  end if;
  v_return := v_row.credit_delta<0 and (public.is_org_member(v_occ.org_id) or public.is_admin(auth.uid())
    or now()<=v_occ.starts_at-make_interval(hours=>v_cutoff));
  update public.org_offering_registration_occurrences set
    status=case when v_return or now()<=v_occ.starts_at-make_interval(hours=>v_cutoff) then 'cancelled' else 'late_cancel' end,
    cancelled_at=now(), cancellation_reason=p_reason, credit_returned=v_return, updated_at=now()
  where id=p_selection_id;
  if v_return then
    select * into v_debit from public.org_offering_credit_ledger
      where occurrence_id=v_row.occurrence_id and athlete_id=v_row.athlete_id and reason='booking'
      order by created_at desc limit 1;
    if v_debit.id is not null then
      insert into public.org_offering_credit_ledger(
        membership_id,cycle_id,athlete_id,occurrence_id,delta,reason,expires_at
      ) values(v_debit.membership_id,v_debit.cycle_id,v_debit.athlete_id,v_debit.occurrence_id,1,'timely_cancellation',v_debit.expires_at);
    end if;
  end if;
  return v_return;
end $$;
revoke all on function public.cancel_family_offering_occurrence(uuid,text) from public,anon;
grant execute on function public.cancel_family_offering_occurrence(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
