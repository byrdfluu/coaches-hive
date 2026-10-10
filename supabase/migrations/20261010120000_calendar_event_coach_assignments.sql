begin;

create table if not exists public.org_calendar_event_coaches (
  event_id uuid not null references public.practice_plans(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key(event_id,coach_id)
);
create index if not exists org_calendar_event_coaches_coach_idx on public.org_calendar_event_coaches(coach_id,event_id);

insert into public.org_calendar_event_coaches(event_id,coach_id,assigned_by)
select id,coach_id,coalesce(created_by,coach_id) from public.practice_plans where org_id is not null and coach_id is not null
on conflict do nothing;

alter table public.org_calendar_event_coaches enable row level security;
drop policy if exists org_calendar_event_coaches_read on public.org_calendar_event_coaches;
create policy org_calendar_event_coaches_read on public.org_calendar_event_coaches for select to authenticated using(
  coach_id=auth.uid() or public.can_manage_org_offering_assignments((select p.org_id from public.practice_plans p where p.id=event_id))
);

create or replace function public.set_org_calendar_event_coaches(p_event_id uuid,p_coach_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_coach uuid;v_new uuid[]:=array(select distinct unnest(coalesce(p_coach_ids,array[]::uuid[])));
begin
 select org_id into v_org from practice_plans where id=p_event_id for update;
 if v_org is null then raise exception 'calendar_event_not_found';end if;
 if not public.can_manage_org_offering_assignments(v_org)then raise exception 'calendar_event_coach_manage_denied' using errcode='42501';end if;
 foreach v_coach in array v_new loop if not public.is_active_org_coach(v_org,v_coach)then raise exception 'coach_not_active_in_organization';end if;end loop;
 delete from org_calendar_event_coaches where event_id=p_event_id and not(coach_id=any(v_new));
 insert into org_calendar_event_coaches(event_id,coach_id,assigned_by)select p_event_id,x,auth.uid()from unnest(v_new)x on conflict do nothing;
 update practice_plans set coach_id=coalesce((select x from unnest(v_new)x limit 1),coach_id),updated_at=now()where id=p_event_id;
end $$;

create or replace function public.my_org_calendar_event_roster(p_event_id uuid)
returns table(athlete_id uuid,athlete_name text,avatar_url text,roster_status text)
language plpgsql security definer set search_path=public as $$
declare v_plan public.practice_plans%rowtype;
begin
 select*into v_plan from practice_plans where id=p_event_id;
 if not found then raise exception 'calendar_event_not_found';end if;
 if not public.is_org_director(v_plan.org_id)and not public.is_admin(auth.uid())and not exists(select 1 from org_calendar_event_coaches a where a.event_id=p_event_id and a.coach_id=auth.uid())then raise exception 'calendar_event_roster_denied' using errcode='42501';end if;
 return query select distinct ap.id,coalesce(ap.full_name,'Athlete'),ap.avatar_url,coalesce(r.status,'invited')
 from athlete_profiles ap join athlete_organization_memberships aom on aom.athlete_id=ap.id and aom.org_id=v_plan.org_id and aom.status='active'
 left join athlete_schedule_rsvps r on r.event_source='practice_plan'and r.event_id=p_event_id and r.athlete_id=ap.id
 where v_plan.audience_scope='organization'
 or v_plan.audience_scope='teams'and exists(select 1 from org_team_members tm where tm.athlete_id=ap.id and tm.team_id=any(v_plan.audience_team_ids))
 or v_plan.audience_scope='age_groups'and exists(select 1 from org_team_members tm join org_teams t on t.id=tm.team_id where tm.athlete_id=ap.id and t.org_id=v_plan.org_id and lower(trim(coalesce(t.age_group,'')))=any(v_plan.audience_age_groups))
 order by 2;
end $$;

drop policy if exists practice_plans_select_scoped on public.practice_plans;
create policy practice_plans_select_scoped on public.practice_plans for select to authenticated using(
  public.is_admin(auth.uid()) or coach_id=auth.uid() or created_by=auth.uid() or athlete_id=auth.uid()
  or exists(select 1 from public.org_calendar_event_coaches a where a.event_id=id and a.coach_id=auth.uid())
  or(team_id is not null and public.can_view_org_team(team_id))
  or(org_id is not null and public.can_manage_org_offering_assignments(org_id))
);

revoke all on function public.set_org_calendar_event_coaches(uuid,uuid[]),public.my_org_calendar_event_roster(uuid)from public,anon;
grant execute on function public.set_org_calendar_event_coaches(uuid,uuid[]),public.my_org_calendar_event_roster(uuid)to authenticated;
grant select on public.org_calendar_event_coaches to authenticated;
notify pgrst,'reload schema';
commit;
