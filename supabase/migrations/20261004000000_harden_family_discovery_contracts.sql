-- Production family discovery must never surface test tenants or records.

create or replace function public.assigned_org_programs_for_athlete(p_athlete_id uuid)
returns table(id uuid,org_id uuid,name text,type text,description text,start_date date,end_date date,price numeric,
  capacity int,location text,status text,coach_id uuid,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select p.id,p.org_id,p.name,p.type,p.description,p.start_date,p.end_date,p.price,p.capacity,p.location,p.status,p.coach_id,p.created_at
  from public.programs p
  join public.organizations o on o.id=p.org_id
  where public.owns_athlete_profile(p_athlete_id)
    and p.status='active'
    and coalesce(o.is_test,false)=false
    and coalesce(o.status,'active')='active'
    and not exists(select 1 from public.business_workspaces w where w.organization_id=o.id and w.workspace_type='organization' and w.is_test=true)
    and public.is_org_program_visible(p.id,p_athlete_id)
  order by p.start_date asc nulls last;
$$;
revoke all on function public.assigned_org_programs_for_athlete(uuid) from public,anon;
grant execute on function public.assigned_org_programs_for_athlete(uuid) to authenticated;

drop function if exists public.discover_public_organizations();
create function public.discover_public_organizations()
returns table(id uuid,name text,sport_primary text,sports_additional text[],description text,city text,state text,zip_code text,profile_image_url text)
language sql stable security definer set search_path='' as $$
  select o.id,coalesce(nullif(s.org_name,''),o.name,'Organization'),o.sport_primary,coalesce(o.sports_additional,'{}'::text[]),
    s.description,o.city,o.state,o.zip_code,s.profile_image_url
  from public.organizations o
  left join public.org_settings s on s.org_id=o.id
  where auth.uid() is not null and coalesce(o.is_test,false)=false and coalesce(o.status,'active')='active'
    and not exists(select 1 from public.business_workspaces w where w.organization_id=o.id and w.workspace_type='organization' and w.is_test=true)
  order by coalesce(nullif(s.org_name,''),o.name,'Organization');
$$;
revoke all on function public.discover_public_organizations() from public;
grant execute on function public.discover_public_organizations() to authenticated;

drop function if exists public.discover_public_coaches();
create function public.discover_public_coaches()
returns table(coach_id uuid,full_name text,sport text,bio text,location text,profile_image_url text,can_message boolean,message_unavailable_reason text)
language sql stable security definer set search_path='' as $$
  select p.id,p.full_name,p.sport,p.bio,p.location,p.avatar_url,
    coalesce((p.coach_privacy_settings->>'allowDirectMessages')::boolean,true)
      and not exists(
        select 1 from public.user_blocks b
        where (b.blocker_id=auth.uid() and b.blocked_user_id=p.id)
           or (b.blocker_id=p.id and b.blocked_user_id=auth.uid())
      ) as can_message,
    case
      when exists(
        select 1 from public.user_blocks b
        where (b.blocker_id=auth.uid() and b.blocked_user_id=p.id)
           or (b.blocker_id=p.id and b.blocked_user_id=auth.uid())
      ) then 'blocked'
      when coalesce((p.coach_privacy_settings->>'allowDirectMessages')::boolean,true)=false then 'direct_messages_disabled'
      else null::text
    end as message_unavailable_reason
  from public.profiles p
  join public.independent_coach_profiles cp on cp.coach_id=p.id
  where auth.uid() is not null and cp.is_active=true and coalesce(p.is_test,false)=false and coalesce(p.status,'active')='active'
    and not exists(select 1 from public.business_workspaces w where w.owner_user_id=p.id and w.workspace_type='independent_coach' and w.is_test=true)
  order by p.full_name nulls last;
$$;
revoke all on function public.discover_public_coaches() from public;
grant execute on function public.discover_public_coaches() to authenticated;

create table if not exists public.family_coach_threads(
  id uuid primary key default gen_random_uuid(),family_user_id uuid not null references public.profiles(id) on delete restrict,
  coach_user_id uuid not null references public.profiles(id) on delete restrict,athlete_profile_id uuid not null references public.athlete_profiles(id) on delete restrict,
  thread_id uuid not null unique references public.threads(id) on delete restrict,created_at timestamptz not null default now(),
  unique(family_user_id,coach_user_id,athlete_profile_id)
);
alter table public.family_coach_threads enable row level security;
drop policy if exists family_coach_threads_participant_read on public.family_coach_threads;
create policy family_coach_threads_participant_read on public.family_coach_threads for select to authenticated
using(family_user_id=auth.uid() or coach_user_id=auth.uid());

create or replace function public.open_family_coach_thread(p_family_user_id uuid,p_coach_id uuid,p_athlete_id uuid)
returns table(thread_id uuid,reused boolean) language plpgsql security definer set search_path=public as $$
declare v_thread uuid;v_coach_name text;v_contact_privacy jsonb;v_family_privacy jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_family_user_id::text||':'||p_coach_id::text||':'||p_athlete_id::text,0));
  if not exists(select 1 from athlete_profiles ap where ap.id=p_athlete_id and ap.status='active' and
    (ap.owner_user_id=p_family_user_id or exists(select 1 from family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_family_user_id)
      or exists(select 1 from guardian_privacy_consents g where g.athlete_id=ap.id and g.guardian_user_id=p_family_user_id and g.guardian_identity_confirmed=true and g.coppa_consent_given=true)))
    then raise exception 'athlete_profile_unavailable';end if;
  select p.full_name,p.coach_privacy_settings into v_coach_name,v_contact_privacy from profiles p
    join independent_coach_profiles cp on cp.coach_id=p.id and cp.is_active=true
    where p.id=p_coach_id and coalesce(p.is_test,false)=false and coalesce(p.status,'active')='active';
  if not found then raise exception 'coach_unavailable';end if;
  if exists(select 1 from business_workspaces w where w.owner_user_id=p_coach_id and w.workspace_type='independent_coach' and w.is_test=true) then raise exception 'coach_unavailable';end if;
  if exists(select 1 from user_blocks b where (b.blocker_id=p_family_user_id and b.blocked_user_id=p_coach_id) or (b.blocker_id=p_coach_id and b.blocked_user_id=p_family_user_id)) then raise exception 'messaging_blocked';end if;
  select athlete_privacy_settings into v_family_privacy from profiles where id=p_family_user_id;
  if coalesce((v_contact_privacy->>'allowDirectMessages')::boolean,true)=false or coalesce((v_family_privacy->>'allowDirectMessages')::boolean,true)=false then raise exception 'messaging_unavailable';end if;
  select f.thread_id into v_thread from family_coach_threads f where f.family_user_id=p_family_user_id and f.coach_user_id=p_coach_id and f.athlete_profile_id=p_athlete_id;
  if v_thread is not null then return query select v_thread,true;return;end if;
  insert into threads(title,is_group,created_by) values(coalesce(v_coach_name,'Coach'),false,p_family_user_id) returning id into v_thread;
  insert into thread_participants(thread_id,user_id,role) values(v_thread,p_family_user_id,'family'),(v_thread,p_coach_id,'coach');
  insert into family_coach_threads(family_user_id,coach_user_id,athlete_profile_id,thread_id) values(p_family_user_id,p_coach_id,p_athlete_id,v_thread);
  return query select v_thread,false;
end $$;
revoke all on function public.open_family_coach_thread(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.open_family_coach_thread(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
