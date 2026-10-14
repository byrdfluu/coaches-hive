begin;

alter table public.org_training_sessions
  add column if not exists booking_mode text not null default 'both';
alter table public.org_training_sessions drop constraint if exists org_training_sessions_booking_mode_check;
alter table public.org_training_sessions add constraint org_training_sessions_booking_mode_check
  check(booking_mode in ('package_credit','drop_in','both'));

drop function if exists public.list_org_training_package_occurrences(uuid,uuid,timestamptz);
create function public.list_org_training_package_occurrences(
  p_package_id uuid,p_athlete_id uuid,p_from timestamptz default now()
) returns table(
  id uuid,org_id uuid,series_id uuid,title text,description text,
  starts_at timestamptz,ends_at timestamptz,timezone text,session_type text,capacity integer,
  booked_count bigint,athlete_booking_status text,drop_in_price_cents integer,location text,
  booking_mode text,coach_id uuid,coach_name text
) language sql stable security definer set search_path=public as $$
  select s.id,s.org_id,s.series_id,coalesce(s.title,'Training Session'),s.description,
    s.starts_at,s.ends_at,s.timezone,s.session_type,s.capacity,
    count(b.id) filter(where b.status in ('pending_payment','reserved','attended','no_show')),
    max(b.status) filter(where b.athlete_id=p_athlete_id and b.status in ('pending_payment','reserved','attended','no_show')),
    s.drop_in_price_cents,s.location,s.booking_mode,s.coach_id,coach.full_name
  from public.org_training_package_sessions ps
  join public.org_training_packages p on p.id=ps.package_id
  join public.org_training_sessions s on s.id=ps.session_id
  left join public.profiles coach on coach.id=s.coach_id
  left join public.org_training_session_bookings b on b.session_id=s.id
  where ps.package_id=p_package_id and p.status='published' and s.status='published'
    and s.starts_at>=p_from and s.booking_mode in ('package_credit','both')
    and exists(select 1 from public.athlete_profiles a where a.id=p_athlete_id
      and (a.owner_user_id=auth.uid() or a.auth_user_id=auth.uid()))
  group by s.id,coach.full_name order by s.starts_at;
$$;
revoke all on function public.list_org_training_package_occurrences(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.list_org_training_package_occurrences(uuid,uuid,timestamptz) to authenticated;

create or replace function public.book_free_org_training_sessions(p_session_ids uuid[],p_athlete_id uuid)
returns table(session_id uuid,booking_id uuid) language plpgsql security definer set search_path=public as $$
declare selected_id uuid; selected public.org_training_sessions; occupied integer; created uuid;
begin
 if cardinality(p_session_ids)=0 or cardinality(p_session_ids)<>cardinality(array(select distinct x from unnest(p_session_ids)x)) then raise exception 'Choose unique sessions'; end if;
 if not exists(select 1 from public.athlete_profiles a where a.id=p_athlete_id and (a.owner_user_id=auth.uid() or a.auth_user_id=auth.uid())) then raise exception 'Not authorized for this athlete'; end if;
 foreach selected_id in array p_session_ids loop
  select * into selected from public.org_training_sessions where id=selected_id for update;
  if selected.id is null or selected.status<>'published' or selected.starts_at<=now() or selected.drop_in_price_cents<>0 or selected.booking_mode not in ('drop_in','both') then raise exception 'Session is not available for free drop-in booking'; end if;
  select count(*) into occupied from public.org_training_session_bookings where session_id=selected_id and status in ('pending_payment','reserved','attended','no_show');
  if occupied>=selected.capacity then raise exception 'Session is full'; end if;
  insert into public.org_training_session_bookings(session_id,athlete_id,booking_type,status,booked_by)
  values(selected_id,p_athlete_id,'drop_in','reserved',auth.uid()) returning id into created;
  session_id:=selected_id;booking_id:=created;return next;
 end loop;
end $$;
revoke all on function public.book_free_org_training_sessions(uuid[],uuid) from public,anon;
grant execute on function public.book_free_org_training_sessions(uuid[],uuid) to authenticated;

notify pgrst,'reload schema';
commit;
