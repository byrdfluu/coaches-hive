begin;

create or replace function public.save_org_calendar_event_with_coaches(
  p_org_id uuid,
  p_event_id uuid,
  p_title text,
  p_description text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_location text,
  p_status text,
  p_event_type text,
  p_coach_ids uuid[],
  p_team_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_event_id uuid;
  v_coach_id uuid;
  v_coach_ids uuid[]:=array(select distinct unnest(coalesce(p_coach_ids,array[]::uuid[])));
begin
  if not public.can_manage_org_offering_assignments(p_org_id) then
    raise exception 'calendar_event_manage_denied' using errcode='42501';
  end if;
  if nullif(trim(p_title),'') is null or p_start_time is null or p_end_time is null or p_end_time<=p_start_time then
    raise exception 'calendar_event_invalid';
  end if;
  if coalesce(array_length(v_coach_ids,1),0)=0 then
    raise exception 'calendar_event_coach_required';
  end if;
  if p_status not in('scheduled','cancelled','completed') or p_event_type not in('practice','game') then
    raise exception 'calendar_event_invalid';
  end if;
  if p_team_id is not null and not exists(select 1 from org_teams where id=p_team_id and org_id=p_org_id) then
    raise exception 'calendar_event_team_invalid';
  end if;
  foreach v_coach_id in array v_coach_ids loop
    if not public.is_active_org_coach(p_org_id,v_coach_id) then
      raise exception 'coach_not_active_in_organization';
    end if;
  end loop;

  if p_event_id is null then
    insert into practice_plans(
      org_id,team_id,coach_id,created_by,title,description,start_time,end_time,session_date,
      duration_minutes,location,status,visibility,shared_with_team,drills
    ) values(
      p_org_id,p_team_id,v_coach_ids[1],auth.uid(),trim(p_title),nullif(trim(p_description),''),p_start_time,p_end_time,
      p_start_time::date,greatest(1,round(extract(epoch from(p_end_time-p_start_time))/60)::int),nullif(trim(p_location),''),
      p_status,'organization',p_team_id is not null,jsonb_build_object('event_type',p_event_type)
    ) returning id into v_event_id;
  else
    update practice_plans set
      team_id=p_team_id,coach_id=v_coach_ids[1],title=trim(p_title),description=nullif(trim(p_description),''),
      start_time=p_start_time,end_time=p_end_time,session_date=p_start_time::date,
      duration_minutes=greatest(1,round(extract(epoch from(p_end_time-p_start_time))/60)::int),
      location=nullif(trim(p_location),''),status=p_status,visibility='organization',shared_with_team=p_team_id is not null,
      drills=jsonb_build_object('event_type',p_event_type),updated_at=now()
    where id=p_event_id and org_id=p_org_id returning id into v_event_id;
    if v_event_id is null then raise exception 'calendar_event_not_found';end if;
  end if;

  delete from org_calendar_event_coaches where event_id=v_event_id;
  insert into org_calendar_event_coaches(event_id,coach_id,assigned_by)
  select v_event_id,x,auth.uid() from unnest(v_coach_ids)x;
  return v_event_id;
end $$;

revoke all on function public.save_org_calendar_event_with_coaches(uuid,uuid,text,text,timestamptz,timestamptz,text,text,text,uuid[],uuid) from public,anon;
grant execute on function public.save_org_calendar_event_with_coaches(uuid,uuid,text,text,timestamptz,timestamptz,text,text,text,uuid[],uuid) to authenticated;
notify pgrst,'reload schema';
commit;
