begin;

create table if not exists public.org_program_coaches (
  program_id uuid not null references public.programs(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (program_id, coach_id)
);
create table if not exists public.org_training_package_coaches (
  package_id uuid not null references public.org_training_packages(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (package_id, coach_id)
);
create table if not exists public.org_tryout_coaches (
  tryout_id uuid not null references public.org_tryouts(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (tryout_id, coach_id)
);
create index if not exists org_program_coaches_coach_idx on public.org_program_coaches(coach_id, program_id);
create index if not exists org_training_package_coaches_coach_idx on public.org_training_package_coaches(coach_id, package_id);
create index if not exists org_tryout_coaches_coach_idx on public.org_tryout_coaches(coach_id, tryout_id);

-- The join table is authoritative. The legacy programs.coach_id is used once
-- for compatibility backfill and is never read by an assignment RPC.
insert into public.org_program_coaches(program_id, coach_id, assigned_by)
select id, coach_id, coach_id from public.programs where coach_id is not null
on conflict do nothing;

create or replace function public.can_manage_org_offering_assignments(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin(p_user_id) or exists (
    select 1 from public.organization_memberships m
    where m.org_id=p_org_id and m.user_id=p_user_id and m.status='active'
      and m.role in ('owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director')
  )
$$;

create or replace function public.is_active_org_coach(p_org_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.profiles p on p.id=m.user_id
    where m.org_id=p_org_id and m.user_id=p_user_id and m.status='active'
      and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false
      and m.role in ('coach','assistant_coach','head_coach','program_director','org_admin','owner')
  )
$$;

alter table public.org_program_coaches enable row level security;
alter table public.org_training_package_coaches enable row level security;
alter table public.org_tryout_coaches enable row level security;
drop policy if exists org_program_coaches_read on public.org_program_coaches;
create policy org_program_coaches_read on public.org_program_coaches for select to authenticated using (
  coach_id=auth.uid() or public.can_manage_org_offering_assignments((select p.org_id from public.programs p where p.id=program_id))
);
drop policy if exists org_training_package_coaches_read on public.org_training_package_coaches;
create policy org_training_package_coaches_read on public.org_training_package_coaches for select to authenticated using (
  coach_id=auth.uid() or public.can_manage_org_offering_assignments((select p.org_id from public.org_training_packages p where p.id=package_id))
);
drop policy if exists org_tryout_coaches_read on public.org_tryout_coaches;
create policy org_tryout_coaches_read on public.org_tryout_coaches for select to authenticated using (
  coach_id=auth.uid() or public.can_manage_org_offering_assignments((select t.org_id from public.org_tryouts t where t.id=tryout_id))
);
drop policy if exists org_training_session_coaches_read on public.org_training_session_coaches;
create policy org_training_session_coaches_read on public.org_training_session_coaches for select to authenticated using (
  coach_id=auth.uid() or public.can_manage_org_offering_assignments((select s.org_id from public.org_training_sessions s where s.id=session_id))
);

create or replace function public.set_org_program_coaches(p_program_id uuid, p_coach_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_coach uuid; v_new uuid[]:=array(select distinct unnest(coalesce(p_coach_ids,array[]::uuid[])));
begin
  select org_id into v_org from programs where id=p_program_id for update;
  if v_org is null then raise exception 'program_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) then raise exception 'program_coach_manage_denied' using errcode='42501'; end if;
  foreach v_coach in array v_new loop if not public.is_active_org_coach(v_org,v_coach) then raise exception 'coach_not_active_in_organization'; end if; end loop;
  delete from org_program_coaches where program_id=p_program_id and not(coach_id=any(v_new));
  insert into org_program_coaches(program_id,coach_id,assigned_by) select p_program_id,x,auth.uid() from unnest(v_new)x on conflict do nothing;
end $$;

create or replace function public.set_org_training_package_coaches(p_package_id uuid, p_coach_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_coach uuid; v_new uuid[]:=array(select distinct unnest(coalesce(p_coach_ids,array[]::uuid[])));
begin
  select org_id into v_org from org_training_packages where id=p_package_id for update;
  if v_org is null then raise exception 'training_package_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) then raise exception 'training_package_coach_manage_denied' using errcode='42501'; end if;
  foreach v_coach in array v_new loop if not public.is_active_org_coach(v_org,v_coach) then raise exception 'coach_not_active_in_organization'; end if; end loop;
  delete from org_training_package_coaches where package_id=p_package_id and not(coach_id=any(v_new));
  insert into org_training_package_coaches(package_id,coach_id,assigned_by) select p_package_id,x,auth.uid() from unnest(v_new)x on conflict do nothing;
end $$;

create or replace function public.set_org_tryout_coaches(p_tryout_id uuid, p_coach_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_coach uuid; v_new uuid[]:=array(select distinct unnest(coalesce(p_coach_ids,array[]::uuid[])));
begin
  select org_id into v_org from org_tryouts where id=p_tryout_id for update;
  if v_org is null then raise exception 'tryout_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) then raise exception 'tryout_coach_manage_denied' using errcode='42501'; end if;
  foreach v_coach in array v_new loop if not public.is_active_org_coach(v_org,v_coach) then raise exception 'coach_not_active_in_organization'; end if; end loop;
  delete from org_tryout_coaches where tryout_id=p_tryout_id and not(coach_id=any(v_new));
  insert into org_tryout_coaches(tryout_id,coach_id,assigned_by) select p_tryout_id,x,auth.uid() from unnest(v_new)x on conflict do nothing;
end $$;

-- Bring the pre-existing session RPC into the same owner/admin/director contract.
create or replace function public.set_org_training_session_coaches(p_session_id uuid,p_coach_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_coach uuid; v_new uuid[]:=array(select distinct unnest(coalesce(p_coach_ids,array[]::uuid[])));
begin
  select org_id into v_org from org_training_sessions where id=p_session_id for update;
  if v_org is null then raise exception 'training_session_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) then raise exception 'training_session_manage_denied' using errcode='42501'; end if;
  foreach v_coach in array v_new loop if not public.is_active_org_coach(v_org,v_coach) then raise exception 'coach_not_active_in_organization'; end if; end loop;
  delete from org_training_session_coaches where session_id=p_session_id and not(coach_id=any(v_new));
  insert into org_training_session_coaches(session_id,coach_id,assigned_by) select p_session_id,x,auth.uid() from unnest(v_new)x on conflict do nothing;
  update org_training_sessions set coach_id=(select x from unnest(v_new)x limit 1),updated_at=now() where id=p_session_id;
end $$;

create or replace function public.my_org_program_roster(p_program_id uuid)
returns table(registration_id uuid,athlete_id uuid,athlete_name text,avatar_url text,registration_status text,registered_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select org_id into v_org from programs where id=p_program_id;
  if v_org is null then raise exception 'program_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) and not exists(select 1 from org_program_coaches where program_id=p_program_id and coach_id=auth.uid()) then raise exception 'program_roster_denied' using errcode='42501'; end if;
  return query select r.id,r.athlete_profile_id,coalesce(a.full_name,'Athlete'),a.avatar_url,r.status,coalesce(r.registered_at,r.created_at)
    from program_registrations r join athlete_profiles a on a.id=r.athlete_profile_id where r.program_id=p_program_id and r.status not in('canceled','cancelled','refunded') order by lower(a.full_name),coalesce(r.registered_at,r.created_at);
end $$;

create or replace function public.my_org_tryout_roster(p_tryout_id uuid)
returns table(registration_id uuid,athlete_id uuid,athlete_name text,avatar_url text,registration_status text,registered_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select org_id into v_org from org_tryouts where id=p_tryout_id;
  if v_org is null then raise exception 'tryout_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) and not exists(select 1 from org_tryout_coaches where tryout_id=p_tryout_id and coach_id=auth.uid()) then raise exception 'tryout_roster_denied' using errcode='42501'; end if;
  return query select r.id,r.athlete_profile_id,coalesce(a.full_name,'Athlete'),a.avatar_url,r.status,r.registered_at
    from org_tryout_registrations r join athlete_profiles a on a.id=r.athlete_profile_id where r.tryout_id=p_tryout_id and r.status not in('canceled','cancelled','refunded') order by lower(a.full_name),r.registered_at;
end $$;

create or replace function public.my_org_training_session_roster(p_session_id uuid)
returns table(booking_id uuid,athlete_id uuid,athlete_name text,avatar_url text,booking_type text,booking_status text,booked_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select org_id into v_org from org_training_sessions where id=p_session_id;
  if v_org is null then raise exception 'training_session_not_found'; end if;
  if not public.can_manage_org_offering_assignments(v_org) and not exists(select 1 from org_training_session_coaches where session_id=p_session_id and coach_id=auth.uid()) then raise exception 'training_session_roster_denied' using errcode='42501'; end if;
  return query select b.id,b.athlete_id,coalesce(a.full_name,'Athlete'),a.avatar_url,b.booking_type,b.status,b.booked_at
    from org_training_session_bookings b join athlete_profiles a on a.id=b.athlete_id where b.session_id=p_session_id and b.status not in('canceled','cancelled','refunded') order by lower(a.full_name),b.booked_at;
end $$;

create or replace function public.notify_org_offering_coach_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_title text; v_offering uuid; v_kind text; v_workspace uuid; v_coach uuid;
begin
  v_coach:=coalesce(new.coach_id,old.coach_id);
  if tg_table_name='org_program_coaches' then v_offering:=coalesce(new.program_id,old.program_id);v_kind:='program';select org_id,name into v_org,v_title from programs where id=v_offering;
  elsif tg_table_name='org_tryout_coaches' then v_offering:=coalesce(new.tryout_id,old.tryout_id);v_kind:='tryout';select org_id,title into v_org,v_title from org_tryouts where id=v_offering;
  else v_offering:=coalesce(new.package_id,old.package_id);v_kind:='training_package';select org_id,name into v_org,v_title from org_training_packages where id=v_offering; end if;
  select id into v_workspace from business_workspaces where organization_id=v_org and workspace_type='organization' and status='active' limit 1;
  insert into notifications(user_id,type,title,body,action_url,workspace_id,data)
  values(v_coach,'organization_offering_assignment',case when tg_op='INSERT' then 'Organization assignment added' else 'Organization assignment removed' end,
    coalesce(v_title,'An offering')||case when tg_op='INSERT' then ' was assigned to you.' else ' is no longer assigned to you.' end,
    '/coach/organization-assignments',v_workspace,jsonb_build_object('offering_type',v_kind,'offering_id',v_offering,'organization_id',v_org));
  return coalesce(new,old);
end $$;
drop trigger if exists notify_org_program_assignment on public.org_program_coaches;
create trigger notify_org_program_assignment after insert or delete on public.org_program_coaches for each row execute function public.notify_org_offering_coach_assignment();
drop trigger if exists notify_org_package_assignment on public.org_training_package_coaches;
create trigger notify_org_package_assignment after insert or delete on public.org_training_package_coaches for each row execute function public.notify_org_offering_coach_assignment();
drop trigger if exists notify_org_tryout_assignment on public.org_tryout_coaches;
create trigger notify_org_tryout_assignment after insert or delete on public.org_tryout_coaches for each row execute function public.notify_org_offering_coach_assignment();

create or replace function public.public_org_offering_coaches(p_org_id uuid)
returns table(offering_type text,offering_id uuid,coach_id uuid,coach_name text,avatar_url text)
language sql stable security definer set search_path=public as $$
  with public_org as (select id from organizations where id=p_org_id and status='active' and is_public=true and coalesce(is_test,false)=false)
  select p.type,p.id,a.coach_id,coalesce(pr.full_name,'Coach'),pr.avatar_url from programs p join public_org o on o.id=p.org_id join org_program_coaches a on a.program_id=p.id join profiles pr on pr.id=a.coach_id where p.status='active' and p.archived_at is null and coalesce(pr.is_test,false)=false
  union all select 'tryout',t.id,a.coach_id,coalesce(pr.full_name,'Coach'),pr.avatar_url from org_tryouts t join public_org o on o.id=t.org_id join org_tryout_coaches a on a.tryout_id=t.id join profiles pr on pr.id=a.coach_id where t.status in('open','published','active') and t.archived_at is null and coalesce(pr.is_test,false)=false
  union all select 'training_package',p.id,a.coach_id,coalesce(pr.full_name,'Coach'),pr.avatar_url from org_training_packages p join public_org o on o.id=p.org_id join org_training_package_coaches a on a.package_id=p.id join profiles pr on pr.id=a.coach_id where p.status='published' and coalesce(pr.is_test,false)=false
  union all select 'training_session',s.id,a.coach_id,coalesce(pr.full_name,'Coach'),pr.avatar_url from org_training_sessions s join public_org o on o.id=s.org_id join org_training_session_coaches a on a.session_id=s.id join profiles pr on pr.id=a.coach_id where s.status='published' and coalesce(pr.is_test,false)=false
$$;

revoke all on function public.can_manage_org_offering_assignments(uuid,uuid),public.is_active_org_coach(uuid,uuid),public.set_org_program_coaches(uuid,uuid[]),public.set_org_training_package_coaches(uuid,uuid[]),public.set_org_tryout_coaches(uuid,uuid[]),public.set_org_training_session_coaches(uuid,uuid[]),public.my_org_program_roster(uuid),public.my_org_tryout_roster(uuid),public.my_org_training_session_roster(uuid),public.public_org_offering_coaches(uuid) from public,anon;
grant execute on function public.set_org_program_coaches(uuid,uuid[]),public.set_org_training_package_coaches(uuid,uuid[]),public.set_org_tryout_coaches(uuid,uuid[]),public.set_org_training_session_coaches(uuid,uuid[]),public.my_org_program_roster(uuid),public.my_org_tryout_roster(uuid),public.my_org_training_session_roster(uuid),public.public_org_offering_coaches(uuid) to authenticated;
grant execute on function public.public_org_offering_coaches(uuid) to service_role;
grant select on public.org_program_coaches,public.org_training_package_coaches,public.org_tryout_coaches to authenticated;
notify pgrst,'reload schema';
commit;
