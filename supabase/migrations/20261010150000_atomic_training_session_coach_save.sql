begin;

create or replace function public.save_org_training_sessions_with_coaches(
  p_org_id uuid,
  p_session_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default 'UTC',
  p_location text default null,
  p_capacity integer default 12,
  p_drop_in_price_cents integer default 0,
  p_status text default 'draft',
  p_coach_ids uuid[] default '{}'::uuid[],
  p_weekly_occurrences integer default 1
) returns table(session_id uuid, occurrence_index integer)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_id uuid;
  v_index integer;
  v_count integer:=greatest(1,least(coalesce(p_weekly_occurrences,1),52));
begin
  if not public.can_manage_org_offering_assignments(p_org_id) then
    raise exception 'organization_offering_management_denied' using errcode='42501';
  end if;
  if nullif(trim(p_title),'') is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then
    raise exception 'invalid_training_session';
  end if;
  if p_capacity<1 or p_drop_in_price_cents<0 or p_status not in('draft','published','cancelled') then
    raise exception 'invalid_training_session';
  end if;

  if p_session_id is not null then
    update public.org_training_sessions set
      title=trim(p_title), description=nullif(trim(p_description),''), starts_at=p_starts_at,
      ends_at=p_ends_at, timezone=coalesce(nullif(trim(p_timezone),''),'UTC'),
      location=nullif(trim(p_location),''), capacity=p_capacity,
      drop_in_price_cents=p_drop_in_price_cents, status=p_status,
      coach_id=p_coach_ids[1], updated_at=now()
    where id=p_session_id and org_id=p_org_id
    returning id into v_id;
    if v_id is null then raise exception 'training_session_not_found'; end if;
    perform public.set_org_training_session_coaches(v_id,p_coach_ids);
    return query select v_id,0;
    return;
  end if;

  for v_index in 0..v_count-1 loop
    insert into public.org_training_sessions(
      org_id,title,description,starts_at,ends_at,timezone,location,capacity,
      session_type,drop_in_price_cents,status,coach_id,updated_at
    ) values (
      p_org_id,trim(p_title),nullif(trim(p_description),''),
      p_starts_at+(v_index*interval '7 days'),p_ends_at+(v_index*interval '7 days'),
      coalesce(nullif(trim(p_timezone),''),'UTC'),nullif(trim(p_location),''),p_capacity,
      'group',p_drop_in_price_cents,p_status,p_coach_ids[1],now()
    ) returning id into v_id;
    perform public.set_org_training_session_coaches(v_id,p_coach_ids);
    return query select v_id,v_index;
  end loop;
end;
$$;

revoke all on function public.save_org_training_sessions_with_coaches(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,integer,text,uuid[],integer) from public;
grant execute on function public.save_org_training_sessions_with_coaches(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,integer,text,uuid[],integer) to authenticated;

commit;
