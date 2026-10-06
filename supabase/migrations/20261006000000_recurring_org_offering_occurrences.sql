-- Authoritative recurring organization training offerings.
-- Each generated org_training_sessions row remains an independent occurrence
-- with its own capacity, bookings, payment state, attendance, and calendar row.

create table if not exists public.org_training_offering_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  session_type text not null check (session_type in ('group','one_on_one')),
  frequency text not null check (frequency in ('weekly','biweekly','monthly','custom')),
  interval_count integer not null default 1 check (interval_count between 1 and 52),
  starts_on date not null,
  ends_on date,
  start_time time not null,
  end_time time not null,
  timezone text not null default 'America/New_York',
  capacity integer not null check (capacity between 1 and 100),
  drop_in_price_cents integer not null check (drop_in_price_cents >= 0),
  location text,
  coach_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (ends_on is null or ends_on >= starts_on),
  check ((session_type = 'one_on_one' and capacity = 1) or session_type = 'group')
);

alter table public.org_training_sessions
  add column if not exists series_id uuid references public.org_training_offering_series(id) on delete set null,
  add column if not exists title text,
  add column if not exists description text;

create index if not exists org_training_series_org_idx
  on public.org_training_offering_series(org_id, status, starts_on);
create index if not exists org_training_sessions_series_idx
  on public.org_training_sessions(series_id, starts_at);

alter table public.org_training_offering_series enable row level security;
drop policy if exists org_training_series_read on public.org_training_offering_series;
create policy org_training_series_read on public.org_training_offering_series for select to authenticated
using (status = 'published' or public.is_org_member(org_id) or public.is_admin(auth.uid()));
drop policy if exists org_training_series_manage on public.org_training_offering_series;
create policy org_training_series_manage on public.org_training_offering_series for all to authenticated
using (public.is_org_director(org_id) or public.is_admin(auth.uid()))
with check (public.is_org_director(org_id) or public.is_admin(auth.uid()));

create or replace function public.materialize_org_training_series(
  p_series_id uuid,
  p_through date default (current_date + 180)
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_series public.org_training_offering_series%rowtype;
  v_date date;
  v_step interval;
  v_count integer := 0;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_series from public.org_training_offering_series where id = p_series_id;
  if not found then raise exception 'Series not found'; end if;
  if not (public.is_org_director(v_series.org_id) or public.is_admin(auth.uid())) then
    raise exception 'Organization administrator access required';
  end if;
  v_step := case v_series.frequency
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    else make_interval(days => 7 * v_series.interval_count)
  end;
  v_date := v_series.starts_on;
  while v_date <= least(coalesce(v_series.ends_on, p_through), p_through) loop
    v_start := (v_date::text || ' ' || v_series.start_time::text || ' ' || v_series.timezone)::timestamptz;
    v_end := (v_date::text || ' ' || v_series.end_time::text || ' ' || v_series.timezone)::timestamptz;
    insert into public.org_training_sessions(
      org_id,coach_id,starts_at,ends_at,timezone,session_type,capacity,
      drop_in_price_cents,location,status,series_id,title,description
    ) values (
      v_series.org_id,v_series.coach_id,v_start,v_end,v_series.timezone,v_series.session_type,
      v_series.capacity,v_series.drop_in_price_cents,v_series.location,
      case when v_series.status='published' then 'published' else 'draft' end,
      v_series.id,v_series.title,v_series.description
    ) on conflict do nothing;
    if found then v_count := v_count + 1; end if;
    v_date := (v_date::timestamp + v_step)::date;
  end loop;
  return v_count;
end;
$$;

create unique index if not exists org_training_series_occurrence_unique
  on public.org_training_sessions(series_id, starts_at) where series_id is not null;

create or replace function public.create_org_training_offering_series(
  p_org_id uuid, p_title text, p_description text, p_session_type text,
  p_frequency text, p_interval_count integer, p_starts_on date, p_ends_on date,
  p_start_time time, p_end_time time, p_timezone text, p_capacity integer,
  p_price_cents integer, p_location text, p_status text default 'draft'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_org_director(p_org_id) or public.is_admin(auth.uid())) then raise exception 'Not authorized'; end if;
  insert into public.org_training_offering_series(
    org_id,title,description,session_type,frequency,interval_count,starts_on,ends_on,
    start_time,end_time,timezone,capacity,drop_in_price_cents,location,status
  ) values (
    p_org_id,trim(p_title),nullif(trim(p_description),''),p_session_type,p_frequency,
    greatest(1,p_interval_count),p_starts_on,p_ends_on,p_start_time,p_end_time,
    coalesce(nullif(p_timezone,''),'America/New_York'),
    case when p_session_type='one_on_one' then 1 else p_capacity end,
    p_price_cents,nullif(trim(p_location),''),p_status
  ) returning id into v_id;
  perform public.materialize_org_training_series(v_id, coalesce(p_ends_on,current_date+180));
  return v_id;
end;
$$;

create or replace function public.book_org_training_sessions_with_credits(
  p_session_ids uuid[], p_athlete_id uuid, p_purchase_ids uuid[]
) returns table(session_id uuid, booking_id uuid)
language plpgsql security definer set search_path = public as $$
declare i integer; v_booking uuid;
begin
  if cardinality(p_session_ids) is distinct from cardinality(p_purchase_ids) then
    raise exception 'Each session requires a purchase';
  end if;
  if cardinality(p_session_ids) is null or cardinality(p_session_ids)=0 then raise exception 'Choose at least one session'; end if;
  if cardinality(p_session_ids) <> cardinality(array(select distinct x from unnest(p_session_ids) x)) then
    raise exception 'Duplicate session selected';
  end if;
  for i in 1..cardinality(p_session_ids) loop
    v_booking := public.book_org_training_session_with_credit(p_session_ids[i],p_athlete_id,p_purchase_ids[i]);
    session_id := p_session_ids[i]; booking_id := v_booking; return next;
  end loop;
end;
$$;

create or replace function public.list_org_training_occurrences(
  p_org_ids uuid[], p_athlete_id uuid, p_from timestamptz default now()
) returns table(
  id uuid, org_id uuid, series_id uuid, title text, description text,
  starts_at timestamptz, ends_at timestamptz, session_type text, capacity integer,
  booked_count bigint, athlete_booking_status text, drop_in_price_cents integer, location text
)
language sql stable security definer set search_path = public as $$
  select s.id,s.org_id,s.series_id,coalesce(s.title,'Training Session'),s.description,
    s.starts_at,s.ends_at,s.session_type,s.capacity,
    count(b.id) filter (where b.status in ('pending_payment','reserved','attended','no_show')),
    max(b.status) filter (where b.athlete_id=p_athlete_id and b.status in ('pending_payment','reserved','attended','no_show')),
    s.drop_in_price_cents,s.location
  from public.org_training_sessions s
  left join public.org_training_session_bookings b on b.session_id=s.id
  where s.org_id=any(p_org_ids) and s.status='published' and s.starts_at>=p_from
    and exists(select 1 from public.athlete_profiles a where a.id=p_athlete_id and (a.owner_user_id=auth.uid() or a.auth_user_id=auth.uid()))
  group by s.id
  order by s.starts_at;
$$;

create or replace function public.update_org_training_occurrence(
  p_session_id uuid, p_scope text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity integer, p_price_cents integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_session public.org_training_sessions%rowtype; v_count integer; v_start_delta interval; v_end_delta interval;
begin
  select * into v_session from public.org_training_sessions where id=p_session_id for update;
  if not found or not (public.is_org_director(v_session.org_id) or public.is_admin(auth.uid())) then raise exception 'Not authorized'; end if;
  if p_scope not in ('occurrence','future','series') then raise exception 'Invalid edit scope'; end if;
  if p_ends_at<=p_starts_at then raise exception 'End must be after start'; end if;
  if p_scope='occurrence' or v_session.series_id is null then
    update public.org_training_sessions set starts_at=p_starts_at,ends_at=p_ends_at,capacity=p_capacity,
      drop_in_price_cents=p_price_cents,updated_at=now() where id=p_session_id;
    return 1;
  end if;
  v_start_delta := p_starts_at-v_session.starts_at; v_end_delta := p_ends_at-v_session.ends_at;
  update public.org_training_sessions set starts_at=starts_at+v_start_delta,ends_at=ends_at+v_end_delta,
    capacity=p_capacity,drop_in_price_cents=p_price_cents,updated_at=now()
  where series_id=v_session.series_id
    -- Preserve historical occurrences and their bookings. A series-wide edit
    -- changes the definition plus only materialized future occurrences.
    and starts_at >= case when p_scope='series' then now() else v_session.starts_at end;
  get diagnostics v_count=row_count;
  update public.org_training_offering_series set capacity=p_capacity,drop_in_price_cents=p_price_cents,
    start_time=p_starts_at::time,end_time=p_ends_at::time,updated_at=now() where id=v_session.series_id;
  return v_count;
end;
$$;

grant execute on function public.materialize_org_training_series(uuid,date) to authenticated;
grant execute on function public.create_org_training_offering_series(uuid,text,text,text,text,integer,date,date,time,time,text,integer,integer,text,text) to authenticated;
grant execute on function public.book_org_training_sessions_with_credits(uuid[],uuid,uuid[]) to authenticated;
grant execute on function public.list_org_training_occurrences(uuid[],uuid,timestamptz) to authenticated;
grant execute on function public.update_org_training_occurrence(uuid,text,timestamptz,timestamptz,integer,integer) to authenticated;

notify pgrst, 'reload schema';
