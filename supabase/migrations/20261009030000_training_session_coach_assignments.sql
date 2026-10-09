begin;
create table if not exists public.org_training_session_coaches(session_id uuid not null references public.org_training_sessions(id) on delete cascade,coach_id uuid not null references public.profiles(id) on delete cascade,assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),assigned_at timestamptz not null default now(),primary key(session_id,coach_id));
create index if not exists org_training_session_coaches_coach_idx on public.org_training_session_coaches(coach_id,session_id);
insert into public.org_training_session_coaches(session_id,coach_id,assigned_by) select s.id,s.coach_id,s.coach_id from public.org_training_sessions s where s.coach_id is not null on conflict do nothing;
alter table public.org_training_session_coaches enable row level security;
drop policy if exists org_training_session_coaches_read on public.org_training_session_coaches;
create policy org_training_session_coaches_read on public.org_training_session_coaches for select to authenticated using(coach_id=auth.uid() or public.is_org_director((select s.org_id from public.org_training_sessions s where s.id=session_id)) or public.is_admin(auth.uid()));

create or replace function public.set_org_training_session_coaches(p_session_id uuid,p_coach_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_coach uuid;v_new uuid[]:=coalesce(p_coach_ids,array[]::uuid[]);
begin
 select org_id into v_org from org_training_sessions where id=p_session_id for update;
 if v_org is null then raise exception'training_session_not_found';end if;
 if not public.is_org_director(v_org)and not public.is_admin(auth.uid())then raise exception'training_session_manage_denied';end if;
 foreach v_coach in array v_new loop
  if not exists(select 1 from organization_memberships m where m.org_id=v_org and m.user_id=v_coach and m.status='active'and m.role in('coach','assistant_coach','head_coach','program_director','org_admin','owner'))then raise exception'coach_not_active_in_organization';end if;
 end loop;
 delete from org_training_session_coaches where session_id=p_session_id and not(coach_id=any(v_new));
 insert into org_training_session_coaches(session_id,coach_id,assigned_by)select p_session_id,x,auth.uid()from unnest(v_new)x on conflict do nothing;
 update org_training_sessions set coach_id=(select x from unnest(v_new)x limit 1),updated_at=now()where id=p_session_id;
end $$;

create or replace function public.my_org_training_session_roster(p_session_id uuid)returns table(booking_id uuid,athlete_id uuid,athlete_name text,avatar_url text,booking_type text,booking_status text,booked_at timestamptz)language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
 select org_id into v_org from org_training_sessions where id=p_session_id;
 if v_org is null then raise exception'training_session_not_found';end if;
 if not public.is_org_director(v_org)and not public.is_admin(auth.uid())and not exists(select 1 from org_training_session_coaches a where a.session_id=p_session_id and a.coach_id=auth.uid())then raise exception'training_session_roster_denied';end if;
 return query select b.id,b.athlete_id,coalesce(ap.full_name,'Athlete'),ap.avatar_url,b.booking_type,b.status,b.booked_at from org_training_session_bookings b join athlete_profiles ap on ap.id=b.athlete_id where b.session_id=p_session_id and b.status not in('cancelled','refunded')order by lower(coalesce(ap.full_name,'')),b.booked_at;
end $$;

create or replace function public.notify_training_session_assignment()returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text;v_org uuid;v_workspace uuid;
begin
 select s.title,s.org_id into v_title,v_org from org_training_sessions s where s.id=coalesce(new.session_id,old.session_id);
 select id into v_workspace from business_workspaces where organization_id=v_org and workspace_type='organization'and status='active'limit 1;
 if tg_op='INSERT'then insert into notifications(user_id,type,title,body,action_url,workspace_id,data)values(new.coach_id,'training_session_assignment','Training session assigned',coalesce(v_title,'A training session')||' was assigned to you.','/org/training-sessions',v_workspace,jsonb_build_object('session_id',new.session_id,'organization_id',v_org));return new;end if;
 insert into notifications(user_id,type,title,body,action_url,workspace_id,data)values(old.coach_id,'training_session_assignment','Training session assignment removed',coalesce(v_title,'A training session')||' is no longer assigned to you.','/org/training-sessions',v_workspace,jsonb_build_object('session_id',old.session_id,'organization_id',v_org));return old;
end $$;
drop trigger if exists notify_training_session_assignment_trigger on public.org_training_session_coaches;
create trigger notify_training_session_assignment_trigger after insert or delete on public.org_training_session_coaches for each row execute function public.notify_training_session_assignment();

create or replace function public.notify_training_session_enrollment()returns trigger language plpgsql security definer set search_path=public as $$
declare v_session uuid:=coalesce(new.session_id,old.session_id);v_title text;v_org uuid;v_workspace uuid;
begin
 select title,org_id into v_title,v_org from org_training_sessions where id=v_session;
 select id into v_workspace from business_workspaces where organization_id=v_org and workspace_type='organization'and status='active'limit 1;
 insert into notifications(user_id,type,title,body,action_url,workspace_id,data)select a.coach_id,'training_session_enrollment','Session roster updated',coalesce(v_title,'A training session')||' has a registration update.','/org/training-sessions',v_workspace,jsonb_build_object('session_id',v_session,'organization_id',v_org)from org_training_session_coaches a where a.session_id=v_session;
 if tg_op='DELETE'then return old;end if;return new;
end $$;
drop trigger if exists notify_training_session_enrollment_trigger on public.org_training_session_bookings;
create trigger notify_training_session_enrollment_trigger after insert or update of status or delete on public.org_training_session_bookings for each row execute function public.notify_training_session_enrollment();

revoke all on function public.set_org_training_session_coaches(uuid,uuid[]),public.my_org_training_session_roster(uuid)from public,anon;
grant execute on function public.set_org_training_session_coaches(uuid,uuid[]),public.my_org_training_session_roster(uuid)to authenticated;
notify pgrst,'reload schema';
commit;
