create table if not exists public.athlete_organization_leave_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  request_note text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decision_note text,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- An earlier version of this table may already exist in production. CREATE
-- TABLE IF NOT EXISTS does not add missing columns, so make the migration
-- safely additive before creating indexes, policies, or functions.
alter table public.athlete_organization_leave_requests
  add column if not exists requested_by uuid references public.profiles(id) on delete restrict,
  add column if not exists request_note text,
  add column if not exists decision_note text,
  add column if not exists resolved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists resolved_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists athlete_org_leave_one_pending_uidx
  on public.athlete_organization_leave_requests(athlete_id,org_id) where status='pending';
create index if not exists athlete_org_leave_org_status_idx
  on public.athlete_organization_leave_requests(org_id,status,created_at desc);

alter table public.athlete_organization_leave_requests enable row level security;
revoke all on public.athlete_organization_leave_requests from anon;
grant select on public.athlete_organization_leave_requests to authenticated;

-- Guardian storage evolved across deployments. Keep this migration compatible
-- with owner-only, accepted-invitation, and family-membership schemas without
-- requiring any optional relation to exist at function-creation time.
create or replace function public.user_can_manage_athlete(p_athlete_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer stable set search_path=public as $$
declare v_allowed boolean:=false;
begin
  select exists(select 1 from public.athlete_profiles ap where ap.id=p_athlete_id
    and p_user_id in (ap.owner_user_id,ap.auth_user_id)) into v_allowed;
  if v_allowed then return true; end if;

  if to_regclass('public.athlete_guardian_invitations') is not null then
    execute 'select exists(select 1 from public.athlete_guardian_invitations
      where athlete_id=$1 and accepted_by=$2 and status=''accepted'')'
      into v_allowed using p_athlete_id,p_user_id;
    if v_allowed then return true; end if;
  end if;

  if to_regclass('public.family_members') is not null then
    execute 'select exists(select 1 from public.athlete_profiles ap
      join public.family_members fm on fm.family_id=ap.family_id
      where ap.id=$1 and fm.user_id=$2 and fm.status=''active''
        and fm.role in (''parent'',''guardian''))'
      into v_allowed using p_athlete_id,p_user_id;
  end if;
  return coalesce(v_allowed,false);
end $$;

revoke all on function public.user_can_manage_athlete(uuid,uuid) from public,anon;
grant execute on function public.user_can_manage_athlete(uuid,uuid) to authenticated,service_role;

drop policy if exists athlete_org_leave_request_read on public.athlete_organization_leave_requests;
create policy athlete_org_leave_request_read on public.athlete_organization_leave_requests
  for select to authenticated using (
    requested_by=auth.uid()
    or exists(select 1 from public.athlete_profiles ap where ap.id=athlete_id and ap.owner_user_id=auth.uid())
    or public.user_can_manage_athlete(athlete_id,auth.uid())
    or public.is_org_director(org_id)
    or public.is_superadmin(auth.uid())
  );

-- A previous rollout created this signature with a different return type.
-- PostgreSQL cannot change a function return type via CREATE OR REPLACE.
drop function if exists public.request_athlete_leave_organization(uuid,uuid,boolean);

create or replace function public.request_athlete_leave_organization(
  p_athlete_id uuid,
  p_org_id uuid,
  p_confirm boolean
) returns public.athlete_organization_leave_requests
language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.athlete_organization_leave_requests;
  v_org_name text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_confirm is not true then raise exception 'confirmation_required'; end if;
  if not public.user_can_manage_athlete(p_athlete_id,v_user_id) then raise exception 'athlete_access_denied'; end if;
  if not exists(select 1 from public.athlete_organization_memberships m where m.athlete_id=p_athlete_id and m.org_id=p_org_id and m.status='active') then
    raise exception 'active_membership_not_found';
  end if;

  insert into public.athlete_organization_leave_requests(athlete_id,org_id,requested_by)
  values(p_athlete_id,p_org_id,v_user_id)
  on conflict(athlete_id,org_id) where status='pending' do update set updated_at=now()
  returning * into v_request;

  select name into v_org_name from public.organizations where id=p_org_id;
  insert into public.notifications(user_id,type,title,body,action_url,data)
  select distinct wm.user_id,'organization_membership','Athlete leave request',
    'A family requested to leave '||coalesce(v_org_name,'the organization')||'.',
    '/org/leave-requests',jsonb_build_object('org_id',p_org_id,'athlete_id',p_athlete_id,'request_id',v_request.id)
  from public.workspace_memberships wm
  join public.business_workspaces bw on bw.id=wm.workspace_id
  where bw.organization_id=p_org_id and bw.workspace_type='organization' and bw.status='active' and wm.status='active'
    and (wm.roles && array['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director']::text[]
      or coalesce((wm.permissions->>'manage_members')::boolean,false)
      or coalesce((wm.permissions->>'members.manage')::boolean,false))
    and not exists(select 1 from public.notifications n where n.user_id=wm.user_id and n.type='organization_membership' and n.data->>'request_id'=v_request.id::text);
  return v_request;
end $$;

grant execute on function public.request_athlete_leave_organization(uuid,uuid,boolean) to authenticated;

drop function if exists public.resolve_athlete_leave_organization(uuid,uuid,text,text);

create or replace function public.resolve_athlete_leave_organization(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_note text default null
) returns public.athlete_organization_leave_requests
language plpgsql security definer set search_path=public as $$
declare
  v_request public.athlete_organization_leave_requests;
  v_target_status text;
  v_recurring_count bigint;
  v_unpaid_count bigint;
  v_future_count bigint;
  v_org_name text;
begin
  if p_decision not in ('approve','decline') then raise exception 'invalid_decision'; end if;
  select * into v_request from public.athlete_organization_leave_requests where id=p_request_id for update;
  if not found then raise exception 'leave_request_not_found'; end if;
  if not exists (
    select 1 from public.workspace_memberships wm join public.business_workspaces bw on bw.id=wm.workspace_id
    where wm.user_id=p_actor_user_id and wm.status='active' and bw.status='active' and bw.workspace_type='organization'
      and bw.organization_id=v_request.org_id
      and (wm.roles && array['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director']::text[]
        or coalesce((wm.permissions->>'manage_members')::boolean,false)
        or coalesce((wm.permissions->>'members.manage')::boolean,false))
  ) then raise exception 'staff_authorization_denied'; end if;

  v_target_status := case when p_decision='approve' then 'approved' else 'declined' end;
  if v_request.status<>'pending' then
    if v_request.status=v_target_status then return v_request; end if;
    raise exception 'leave_request_already_resolved';
  end if;

  if p_decision='approve' then
    select count(*) into v_recurring_count from public.organization_recurring_fees
      where athlete_id=v_request.athlete_id and organization_id=v_request.org_id
      and status in ('active','trialing','past_due','paused','processing');
    if v_recurring_count>0 then raise exception 'recurring_billing_active'; end if;

    select count(*) into v_unpaid_count from public.org_fee_assignments
      where athlete_id=v_request.athlete_id and org_id=v_request.org_id
      and status in ('pending','due','overdue','past_due','processing');
    select count(*) into v_future_count from public.program_registrations pr join public.programs p on p.id=pr.program_id
      where pr.athlete_profile_id=v_request.athlete_id and p.org_id=v_request.org_id
      and p.start_date>=current_date and pr.status in ('pending','paid','active','registered');
    if v_unpaid_count>0 or v_future_count>0 then raise exception 'departure_obligations_remaining'; end if;

    delete from public.org_team_members otm using public.org_teams t
      where otm.team_id=t.id and t.org_id=v_request.org_id and otm.athlete_id=v_request.athlete_id;
    update public.coach_athlete_links set status='inactive',updated_at=now()
      where athlete_id=v_request.athlete_id and org_id=v_request.org_id and status='active';
    update public.athlete_organization_memberships set status='left',updated_at=now()
      where athlete_id=v_request.athlete_id and org_id=v_request.org_id and status='active';
  end if;

  update public.athlete_organization_leave_requests set status=v_target_status,decision_note=nullif(trim(p_note),''),
    resolved_by=p_actor_user_id,resolved_at=now(),updated_at=now() where id=v_request.id returning * into v_request;

  insert into public.org_audit_log(org_id,action,actor_id,target_type,target_id,metadata)
  values(v_request.org_id,'athlete_leave_request_'||v_target_status,p_actor_user_id,'athlete_organization_leave_request',v_request.id,
    jsonb_build_object('athlete_id',v_request.athlete_id,'decision_note',v_request.decision_note));

  select name into v_org_name from public.organizations where id=v_request.org_id;
  insert into public.notifications(user_id,type,title,body,action_url,data)
  select recipients.user_id,'organization_membership','Organization leave request '||v_target_status,
      'Your request to leave '||coalesce(v_org_name,'the organization')||' was '||v_target_status||'.',
      '/athlete/orgs-teams',jsonb_build_object('org_id',v_request.org_id,'athlete_id',v_request.athlete_id,'request_id',v_request.id,'decision',v_target_status)
  from (
    select coalesce(ap.owner_user_id,ap.auth_user_id) as user_id from public.athlete_profiles ap where ap.id=v_request.athlete_id
    union
    select v_request.requested_by
  ) recipients
  where recipients.user_id is not null and not exists(
    select 1 from public.notifications n where n.user_id=recipients.user_id and n.type='organization_membership'
      and n.data->>'request_id'=v_request.id::text and n.data->>'decision'=v_target_status
  );
  return v_request;
end $$;

revoke all on function public.resolve_athlete_leave_organization(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_athlete_leave_organization(uuid,uuid,text,text) to service_role;
