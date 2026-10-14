begin;

-- A package may redeem only the sessions explicitly attached to it. The
-- junction supports shared sessions without making eligibility org-wide.
create table if not exists public.org_training_package_sessions (
  package_id uuid not null references public.org_training_packages(id) on delete cascade,
  session_id uuid not null references public.org_training_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(package_id,session_id)
);
create index if not exists org_training_package_sessions_session_idx
  on public.org_training_package_sessions(session_id,package_id);

create table if not exists public.org_training_package_series (
  package_id uuid not null references public.org_training_packages(id) on delete cascade,
  series_id uuid not null references public.org_training_offering_series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(package_id,series_id)
);

-- Some deployments predate the legacy schedule table. Backfill it only when
-- both that table and its session foreign-key column are present.
do $$
begin
  if to_regclass('public.org_training_package_schedules') is not null
     and exists(select 1 from information_schema.columns where table_schema='public'
       and table_name='org_training_sessions' and column_name='schedule_id') then
    execute $sql$
      insert into public.org_training_package_sessions(package_id,session_id)
      select sch.package_id,s.id
      from public.org_training_sessions s
      join public.org_training_package_schedules sch on sch.id=s.schedule_id
      on conflict do nothing
    $sql$;
  end if;
end $$;

alter table public.org_training_package_sessions enable row level security;
alter table public.org_training_package_series enable row level security;
drop policy if exists org_training_package_sessions_read on public.org_training_package_sessions;
create policy org_training_package_sessions_read on public.org_training_package_sessions
for select to authenticated using (
  exists(select 1 from public.org_training_packages p where p.id=package_id and
    (p.status='published' or public.is_org_member(p.org_id) or public.is_admin(auth.uid())))
);
drop policy if exists org_training_package_sessions_manage on public.org_training_package_sessions;
create policy org_training_package_sessions_manage on public.org_training_package_sessions
for all to authenticated using (
  exists(select 1 from public.org_training_packages p where p.id=package_id and
    (public.is_org_director(p.org_id) or public.is_admin(auth.uid())))
) with check (
  exists(select 1 from public.org_training_packages p where p.id=package_id and
    (public.is_org_director(p.org_id) or public.is_admin(auth.uid())))
);
drop policy if exists org_training_package_series_read on public.org_training_package_series;
create policy org_training_package_series_read on public.org_training_package_series for select to authenticated using(
  exists(select 1 from public.org_training_packages p where p.id=package_id and
    (p.status='published' or public.is_org_member(p.org_id) or public.is_admin(auth.uid())))
);
drop policy if exists org_training_package_series_manage on public.org_training_package_series;
create policy org_training_package_series_manage on public.org_training_package_series for all to authenticated using(
  exists(select 1 from public.org_training_packages p where p.id=package_id and
    (public.is_org_director(p.org_id) or public.is_admin(auth.uid())))
) with check(
  exists(select 1 from public.org_training_packages p where p.id=package_id and
    (public.is_org_director(p.org_id) or public.is_admin(auth.uid())))
);

create or replace function public.link_org_training_package_sessions(p_package_id uuid,p_session_ids uuid[])
returns integer language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_count integer;
begin
  select org_id into v_org from public.org_training_packages where id=p_package_id;
  if v_org is null or not (public.is_org_director(v_org) or public.is_admin(auth.uid())) then
    raise exception 'Organization administrator access required';
  end if;
  if exists(select 1 from unnest(coalesce(p_session_ids,'{}'::uuid[])) x
    left join public.org_training_sessions s on s.id=x
    where s.id is null or s.org_id<>v_org) then
    raise exception 'Every session must belong to the package organization';
  end if;
  insert into public.org_training_package_sessions(package_id,session_id)
  select p_package_id,x from unnest(coalesce(p_session_ids,'{}'::uuid[])) x on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.cancel_org_training_booking(p_booking_id uuid,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_booking public.org_training_session_bookings; v_session public.org_training_sessions;
  v_package public.org_training_packages; v_return boolean;
begin
  select * into v_booking from public.org_training_session_bookings where id=p_booking_id for update;
  select * into v_session from public.org_training_sessions where id=v_booking.session_id;
  if v_booking.id is null or v_booking.status not in ('reserved','pending_payment') then raise exception 'Booking cannot be cancelled'; end if;
  if not (v_booking.booked_by=auth.uid() or public.is_org_member(v_session.org_id) or public.is_admin(auth.uid())) then raise exception 'Not authorized'; end if;
  select p.* into v_package from public.org_training_packages p join public.org_training_package_purchases x on x.package_id=p.id where x.id=v_booking.purchase_id;
  v_return := v_booking.booking_type='credit' and (public.is_org_member(v_session.org_id) or public.is_admin(auth.uid())
    or now()<=v_session.starts_at-make_interval(hours=>coalesce(v_package.cancellation_cutoff_hours,24)));
  update public.org_training_session_bookings set status=case when v_return then 'cancelled' else 'late_cancel' end,
    cancelled_at=now(),cancellation_reason=p_reason,credit_returned=v_return,updated_at=now() where id=p_booking_id;
  if v_return then
    insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,session_id,created_by,note)
    values(v_booking.purchase_id,v_booking.athlete_id,v_session.session_type,1,
      case when public.is_org_member(v_session.org_id) then 'academy_cancellation' else 'timely_cancellation' end,
      v_session.id,auth.uid(),p_reason);
  end if;
  insert into public.notifications(user_id,title,body,type,related_id)
  values(v_booking.booked_by,'Training booking canceled',
    case when v_return then 'Your session was canceled and its credit was returned.'
      else 'Your session was canceled after the cutoff, so its credit was not returned.' end,
    'training_booking_cancelled',p_booking_id);
  return v_return;
end $$;

create or replace function public.link_org_training_package_series(p_package_id uuid,p_series_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_package_org uuid; v_series_org uuid; v_count integer;
begin
  select org_id into v_package_org from public.org_training_packages where id=p_package_id;
  select org_id into v_series_org from public.org_training_offering_series where id=p_series_id;
  if v_package_org is null or v_series_org is null or v_package_org<>v_series_org then raise exception 'Package and series must belong to the same organization'; end if;
  if not (public.is_org_director(v_package_org) or public.is_admin(auth.uid())) then raise exception 'Organization administrator access required'; end if;
  insert into public.org_training_package_series(package_id,series_id) values(p_package_id,p_series_id) on conflict do nothing;
  insert into public.org_training_package_sessions(package_id,session_id)
  select p_package_id,id from public.org_training_sessions where series_id=p_series_id on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.attach_materialized_training_session_to_packages()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_schedule_id uuid;
begin
  if new.series_id is not null then
    insert into public.org_training_package_sessions(package_id,session_id)
    select package_id,new.id from public.org_training_package_series where series_id=new.series_id on conflict do nothing;
  end if;
  v_schedule_id := nullif(to_jsonb(new)->>'schedule_id','')::uuid;
  if v_schedule_id is not null and to_regclass('public.org_training_package_schedules') is not null then
    execute 'insert into public.org_training_package_sessions(package_id,session_id)
      select package_id,$1 from public.org_training_package_schedules where id=$2 on conflict do nothing'
      using new.id,v_schedule_id;
  end if;
  return new;
end $$;
drop trigger if exists attach_materialized_training_session_to_packages on public.org_training_sessions;
create trigger attach_materialized_training_session_to_packages after insert on public.org_training_sessions
for each row execute function public.attach_materialized_training_session_to_packages();

-- Package-scoped availability for family selection and capacity display.
create or replace function public.list_org_training_package_occurrences(
  p_package_id uuid,p_athlete_id uuid,p_from timestamptz default now()
) returns table(
  id uuid,org_id uuid,series_id uuid,title text,description text,
  starts_at timestamptz,ends_at timestamptz,session_type text,capacity integer,
  booked_count bigint,athlete_booking_status text,drop_in_price_cents integer,location text
) language sql stable security definer set search_path=public as $$
  select s.id,s.org_id,s.series_id,coalesce(s.title,'Training Session'),s.description,
    s.starts_at,s.ends_at,s.session_type,s.capacity,
    count(b.id) filter(where b.status in ('pending_payment','reserved','attended','no_show')),
    max(b.status) filter(where b.athlete_id=p_athlete_id and b.status in ('pending_payment','reserved','attended','no_show')),
    s.drop_in_price_cents,s.location
  from public.org_training_package_sessions ps
  join public.org_training_packages p on p.id=ps.package_id
  join public.org_training_sessions s on s.id=ps.session_id
  left join public.org_training_session_bookings b on b.session_id=s.id
  where ps.package_id=p_package_id and p.status='published' and s.status='published'
    and s.starts_at>=p_from
    and exists(select 1 from public.athlete_profiles a where a.id=p_athlete_id
      and (a.owner_user_id=auth.uid() or a.auth_user_id=auth.uid()))
  group by s.id order by s.starts_at;
$$;

-- Enforce package eligibility, capacity, ownership and balance atomically.
create or replace function public.book_org_training_session_with_credit(
  p_session_id uuid,p_athlete_id uuid,p_purchase_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.org_training_sessions; v_purchase public.org_training_package_purchases;
  v_balance integer; v_count integer; v_booking uuid;
begin
  select * into v_session from public.org_training_sessions where id=p_session_id for update;
  select * into v_purchase from public.org_training_package_purchases where id=p_purchase_id for update;
  if v_session.id is null or v_session.status<>'published' or v_session.starts_at<=now() then raise exception 'Session is not bookable'; end if;
  if v_purchase.id is null or v_purchase.status<>'active' or v_purchase.athlete_id<>p_athlete_id
     or v_purchase.org_id<>v_session.org_id or (v_purchase.expires_at is not null and v_purchase.expires_at<=now()) then
    raise exception 'No active package for this athlete';
  end if;
  if not exists(select 1 from public.org_training_package_sessions x
    where x.package_id=v_purchase.package_id and x.session_id=p_session_id) then
    raise exception 'This session is not included in the selected package';
  end if;
  if not (v_purchase.purchaser_user_id=auth.uid() or exists(select 1 from public.athlete_profiles a
    where a.id=p_athlete_id and (a.owner_user_id=auth.uid() or a.auth_user_id=auth.uid()))) then raise exception 'Not authorized for this athlete'; end if;
  select coalesce(sum(delta),0) into v_balance from public.org_training_credit_ledger
    where purchase_id=p_purchase_id and credit_type=v_session.session_type;
  if v_balance<1 then raise exception 'No remaining % credit',replace(v_session.session_type,'_','-'); end if;
  select count(*) into v_count from public.org_training_session_bookings where session_id=p_session_id
    and status in ('pending_payment','reserved','attended','no_show');
  if v_count>=v_session.capacity then raise exception 'Session is full'; end if;
  insert into public.org_training_session_bookings(session_id,athlete_id,purchase_id,booking_type,status,booked_by)
  values(p_session_id,p_athlete_id,p_purchase_id,'credit','reserved',auth.uid()) returning id into v_booking;
  insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,session_id,created_by)
  values(p_purchase_id,p_athlete_id,v_session.session_type,-1,'booking',p_session_id,auth.uid());
  insert into public.notifications(user_id,title,body,type,related_id)
  values(v_purchase.purchaser_user_id,'Training session reserved',
    'Your athlete is booked for '||to_char(v_session.starts_at at time zone v_session.timezone,'Mon DD at FMHH:MI AM')||'.',
    'training_booking_confirmed',v_booking);
  return v_booking;
end $$;

-- Prevent duplicate renewal grants and expire unused recurring credits when a
-- new paid period starts. One-time packages receive one lifetime grant key.
create table if not exists public.org_training_credit_grants (
  purchase_id uuid not null references public.org_training_package_purchases(id) on delete cascade,
  period_key text not null,
  granted_at timestamptz not null default now(),
  primary key(purchase_id,period_key)
);
alter table public.org_training_credit_grants enable row level security;
drop policy if exists org_training_credit_grants_read on public.org_training_credit_grants;
create policy org_training_credit_grants_read on public.org_training_credit_grants for select to authenticated using(
  exists(select 1 from public.org_training_package_purchases p where p.id=purchase_id and
    (p.purchaser_user_id=auth.uid() or public.is_org_member(p.org_id) or public.is_admin(auth.uid())))
);

create or replace function public.activate_org_training_purchase(
  p_purchase_id uuid,p_payment_record_id uuid default null,p_stripe_subscription_id text default null,
  p_current_period_end timestamptz default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_purchase public.org_training_package_purchases; v_package public.org_training_packages;
  v_key text; v_inserted integer; v_balance integer; v_type text;
begin
  select * into v_purchase from public.org_training_package_purchases where id=p_purchase_id for update;
  select * into v_package from public.org_training_packages where id=v_purchase.package_id;
  if v_purchase.id is null or v_package.id is null then raise exception 'Purchase not found'; end if;
  if not public.is_admin(auth.uid()) then raise exception 'Only the verified payment backend can activate credits'; end if;
  v_key := case when v_package.billing_type='recurring'
    then coalesce(p_current_period_end::text,'missing-period-end') else 'one-time' end;
  insert into public.org_training_credit_grants(purchase_id,period_key) values(p_purchase_id,v_key)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;
  update public.org_training_package_purchases set status='active',
    payment_record_id=coalesce(p_payment_record_id,payment_record_id),
    stripe_subscription_id=coalesce(p_stripe_subscription_id,stripe_subscription_id),
    current_period_end=case when v_package.billing_type='recurring' then coalesce(p_current_period_end,current_period_end) else null end,
    purchased_at=coalesce(purchased_at,now()),
    expires_at=case when v_package.billing_type='recurring' then null else coalesce(expires_at,now()+make_interval(days=>v_package.validity_days)) end,
    updated_at=now() where id=p_purchase_id;
  if v_inserted=0 then return; end if;
  if v_package.billing_type='recurring' and exists(select 1 from public.org_training_credit_grants where purchase_id=p_purchase_id and period_key<>v_key) then
    foreach v_type in array array['group','one_on_one'] loop
      select coalesce(sum(delta),0) into v_balance from public.org_training_credit_ledger where purchase_id=p_purchase_id and credit_type=v_type;
      if v_balance>0 then
        insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by,note)
        values(p_purchase_id,v_purchase.athlete_id,v_type,-v_balance,'expiration',auth.uid(),'Unused credits expired at renewal');
      end if;
    end loop;
  end if;
  if v_package.group_credits>0 then insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by)
    values(p_purchase_id,v_purchase.athlete_id,'group',v_package.group_credits,'purchase',auth.uid()); end if;
  if v_package.one_on_one_credits>0 then insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by)
    values(p_purchase_id,v_purchase.athlete_id,'one_on_one',v_package.one_on_one_credits,'purchase',auth.uid()); end if;
end $$;

-- Publishing requires usable inventory and an assigned coach. Free packages
-- do not require Stripe; paid packages still do.
create or replace function public.set_org_training_package_status(p_package_id uuid,p_status text)
returns public.org_training_packages language plpgsql security definer set search_path=public as $$
declare v_row public.org_training_packages;
begin
  select * into v_row from public.org_training_packages where id=p_package_id for update;
  if v_row.id is null or not (public.is_org_director(v_row.org_id) or public.is_admin(auth.uid())) then raise exception 'Not authorized'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'Invalid package status'; end if;
  if p_status='published' then
    if v_row.group_credits+v_row.one_on_one_credits<1 then raise exception 'Add at least one package credit before publishing'; end if;
    if not exists(select 1 from public.org_training_package_coaches where package_id=p_package_id) then raise exception 'Assign at least one eligible coach before publishing'; end if;
    if not exists(select 1 from public.org_training_package_sessions ps join public.org_training_sessions s on s.id=ps.session_id
      where ps.package_id=p_package_id and s.starts_at>now() and s.status in ('draft','published')) then
      raise exception 'Add at least one future date and time before publishing';
    end if;
    if v_row.price_cents>0 and not public.org_training_payments_ready(v_row.org_id) then raise exception 'Finish Stripe setup before publishing paid packages'; end if;
  end if;
  update public.org_training_packages set status=p_status,updated_at=now() where id=p_package_id returning * into v_row;
  return v_row;
end $$;

-- Reporting source shared by mobile and web dashboards.
create or replace view public.org_training_package_metrics as
select p.id package_id,p.org_id,p.name,p.status,
  (select count(*) from public.org_training_package_sessions ps join public.org_training_sessions s on s.id=ps.session_id
    where ps.package_id=p.id and s.starts_at>now()) upcoming_sessions,
  (select count(*) from public.org_training_package_sessions ps join public.org_training_session_bookings b on b.session_id=ps.session_id
    where ps.package_id=p.id and b.status in ('reserved','attended','no_show')) bookings,
  (select count(*) from public.org_training_package_sessions ps join public.org_training_session_bookings b on b.session_id=ps.session_id
    where ps.package_id=p.id and b.status='attended') attended,
  (select count(*) from public.org_training_package_sessions ps join public.org_training_session_bookings b on b.session_id=ps.session_id
    where ps.package_id=p.id and b.status='no_show') no_shows,
  (select count(*) from public.org_training_package_sessions ps join public.org_training_session_bookings b on b.session_id=ps.session_id
    where ps.package_id=p.id and b.status in ('cancelled','late_cancel')) cancellations,
  (select count(*) from public.org_training_package_purchases x where x.package_id=p.id and x.status='active') active_purchases,
  (select coalesce(sum(-l.delta),0) from public.org_training_credit_ledger l
    join public.org_training_package_purchases x on x.id=l.purchase_id where x.package_id=p.id and l.reason='booking') credits_used
from public.org_training_packages p;

grant select on public.org_training_package_sessions,public.org_training_package_series,public.org_training_credit_grants to authenticated;
grant select on public.org_training_package_metrics to authenticated;
grant execute on function public.link_org_training_package_sessions(uuid,uuid[]) to authenticated;
grant execute on function public.link_org_training_package_series(uuid,uuid) to authenticated;
grant execute on function public.list_org_training_package_occurrences(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.book_org_training_session_with_credit(uuid,uuid,uuid) to authenticated;
grant execute on function public.cancel_org_training_booking(uuid,text) to authenticated;
revoke all on function public.activate_org_training_purchase(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_org_training_purchase(uuid,uuid,text,timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
