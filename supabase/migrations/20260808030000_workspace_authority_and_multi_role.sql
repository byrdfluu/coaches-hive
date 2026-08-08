-- Multi-role, multi-workspace authority. Compatibility-safe: profiles.role and
-- existing org_id/coach_id columns remain available to older app builds.
create extension if not exists pgcrypto;

create table if not exists public.business_workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_type text not null check (workspace_type in ('organization','independent_coach')),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete restrict,
  display_name text not null,
  status text not null default 'active' check (status in ('active','restricted','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (workspace_type='organization' and organization_id is not null) or
    (workspace_type='independent_coach' and owner_user_id is not null and organization_id is null)
  )
);
create unique index if not exists business_workspaces_org_uidx
  on public.business_workspaces(organization_id) where workspace_type='organization';
create unique index if not exists business_workspaces_independent_uidx
  on public.business_workspaces(owner_user_id) where workspace_type='independent_coach';

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  roles text[] not null default '{}',
  permissions jsonb not null default '{}',
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,user_id),
  check (roles <@ array['owner','org_admin','coach','assistant_coach','team_manager','athlete']::text[])
);
create index if not exists workspace_memberships_user_idx on public.workspace_memberships(user_id,status);

create table if not exists public.active_workspace_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  acting_role text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_athlete_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('organization_member','independent_client')),
  status text not null default 'active' check (status in ('invited','pending','active','inactive')),
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,athlete_id)
);

create table if not exists public.athlete_access_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athlete_profiles(id) on delete cascade,
  athlete_email text,
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','rejected','canceled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (athlete_id is not null or nullif(trim(athlete_email),'') is not null)
);

create table if not exists public.workspace_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  acting_role text,
  event_type text not null,
  record_type text,
  record_id uuid,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index if not exists workspace_audit_events_workspace_idx
  on public.workspace_audit_events(workspace_id,occurred_at desc);

alter table if exists public.mobile_checkout_handoffs
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.platform_subscriptions
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.stripe_connect_accounts
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.apple_iap_subscriptions
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;

drop policy if exists "superadmins read workspace handoffs" on public.mobile_checkout_handoffs;
create policy "superadmins read workspace handoffs" on public.mobile_checkout_handoffs
  for select to authenticated using(public.is_admin(auth.uid()));
drop policy if exists "superadmins read workspace subscriptions" on public.platform_subscriptions;
create policy "superadmins read workspace subscriptions" on public.platform_subscriptions
  for select to authenticated using(public.is_admin(auth.uid()));
create index if not exists mobile_checkout_handoffs_workspace_idx on public.mobile_checkout_handoffs(workspace_id,created_at desc);
create index if not exists platform_subscriptions_workspace_idx on public.platform_subscriptions(workspace_id,status);

alter table public.business_workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.active_workspace_preferences enable row level security;
alter table public.workspace_athlete_relationships enable row level security;
alter table public.athlete_access_requests enable row level security;
alter table public.workspace_audit_events enable row level security;

create or replace function public.is_workspace_member(p_workspace_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id
    and m.user_id=p_user_id and m.status='active')
$$;
create or replace function public.workspace_has_role(p_workspace_id uuid,p_role text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id
    and m.user_id=p_user_id and m.status='active' and p_role=any(m.roles))
$$;
create or replace function public.workspace_has_permission(p_workspace_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id
    and m.user_id=p_user_id and m.status='active' and (
      coalesce((m.permissions->>p_permission)::boolean,false)
      or m.roles && array['owner','org_admin']::text[]
    ))
$$;

revoke all on function public.is_workspace_member(uuid,uuid),public.workspace_has_role(uuid,text,uuid),public.workspace_has_permission(uuid,text,uuid) from public,anon;
grant execute on function public.is_workspace_member(uuid,uuid),public.workspace_has_role(uuid,text,uuid),public.workspace_has_permission(uuid,text,uuid) to authenticated;

drop policy if exists workspace_visible_to_member on public.business_workspaces;
create policy workspace_visible_to_member on public.business_workspaces for select
  using(public.is_workspace_member(id) or public.is_admin(auth.uid()));
drop policy if exists workspace_memberships_visible on public.workspace_memberships;
create policy workspace_memberships_visible on public.workspace_memberships for select
  using(user_id=auth.uid() or public.workspace_has_permission(workspace_id,'manage_members') or public.is_admin(auth.uid()));
drop policy if exists workspace_preference_own on public.active_workspace_preferences;
create policy workspace_preference_own on public.active_workspace_preferences for all
  using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_workspace_member(workspace_id));
drop policy if exists workspace_athletes_visible on public.workspace_athlete_relationships;
create policy workspace_athletes_visible on public.workspace_athlete_relationships for select
  using(public.is_workspace_member(workspace_id) or public.owns_athlete_profile(athlete_id));
drop policy if exists athlete_requests_visible on public.athlete_access_requests;
create policy athlete_requests_visible on public.athlete_access_requests for select
  using(requested_by=auth.uid() or public.workspace_has_permission(workspace_id,'approve_athletes'));
drop policy if exists workspace_audit_visible on public.workspace_audit_events;
create policy workspace_audit_visible on public.workspace_audit_events for select
  using(public.workspace_has_permission(workspace_id,'view_audit') or public.is_admin(auth.uid()));

-- Organization workspaces and memberships.
insert into public.business_workspaces(workspace_type,organization_id,owner_user_id,display_name)
select 'organization',o.id,
  (select om.user_id from public.organization_memberships om where om.org_id=o.id and om.status='active'
    and om.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director') order by om.created_at limit 1),
  coalesce(nullif(trim(os.org_name),''),nullif(trim(o.name),''),'Organization')
from public.organizations o left join public.org_settings os on os.org_id=o.id
on conflict do nothing;

insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status)
select w.id,om.user_id,
  array_agg(distinct case
    when om.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director') then 'org_admin'
    when om.role='assistant_coach' then 'assistant_coach'
    when om.role='team_manager' then 'team_manager'
    when om.role='athlete' then 'athlete'
    else 'coach' end),
  case when bool_or(om.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director'))
    then '{"manage_members":true,"approve_athletes":true,"manage_teams":true,"manage_pricing":true,"view_revenue":true,"manage_connect":true,"view_audit":true,"export_records":true}'::jsonb
    else '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb end,
  'active'
from public.organization_memberships om join public.business_workspaces w on w.organization_id=om.org_id
where om.status='active' group by w.id,om.user_id
on conflict(workspace_id,user_id) do update set roles=excluded.roles,permissions=excluded.permissions,status='active';

-- Owners who already have organization admin access may also act as a coach
-- inside that same paid organization without creating an independent business.
update public.workspace_memberships m set roles=(select array_agg(distinct role_name) from unnest(m.roles||array['coach']) role_name)
from public.business_workspaces w where w.id=m.workspace_id and w.workspace_type='organization'
  and m.roles && array['owner','org_admin']::text[];

-- Independent workspaces exist only for coaches who explicitly already have
-- an independent profile; this migration never creates one from portal usage.
insert into public.business_workspaces(workspace_type,owner_user_id,display_name)
select 'independent_coach',icp.coach_id,coalesce(nullif(trim(p.full_name),''),'Independent Coaching')
from public.independent_coach_profiles icp join public.profiles p on p.id=icp.coach_id where icp.is_active
on conflict do nothing;
insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status)
select w.id,w.owner_user_id,array['owner','coach']::text[],
  '{"manage_members":true,"approve_athletes":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true,"manage_connect":true,"send_documents":true,"view_audit":true,"export_records":true}'::jsonb,'active'
from public.business_workspaces w where w.workspace_type='independent_coach'
on conflict(workspace_id,user_id) do update set roles=excluded.roles,permissions=excluded.permissions,status='active';

insert into public.workspace_athlete_relationships(workspace_id,athlete_id,relationship_type,status)
select distinct w.id,aom.athlete_id,'organization_member','active'
from public.athlete_organization_memberships aom join public.business_workspaces w on w.organization_id=aom.org_id
where aom.status='active' on conflict(workspace_id,athlete_id) do update set status='active';

-- Compatibility backfill onto the highest-risk business records. Columns are
-- nullable during rollout so ambiguous legacy rows go to reconciliation rather
-- than being assigned to the wrong owner.
do $$ declare t text; has_org boolean;
begin
  foreach t in array array['sessions','coach_waivers','coach_waiver_assignments','org_documents','org_document_completions',
    'marketplace_items','marketplace_orders','messages','conversations','org_fee_assignments','coach_fee_assignments','coach_availability_blocks',
    'programs','program_registrations','training_plans','coach_notes','bookings','session_bookings']
  loop
    if to_regclass('public.'||t) is not null then execute format('alter table public.%I add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict',t); end if;
  end loop;
end $$;

update public.programs p set workspace_id=w.id from public.business_workspaces w
where w.organization_id=p.org_id and p.workspace_id is null;
update public.program_registrations r set workspace_id=p.workspace_id from public.programs p
where p.id=r.program_id and r.workspace_id is null;
update public.coach_waiver_assignments a set workspace_id=w.workspace_id from public.coach_waivers w
where w.id=a.waiver_id and a.workspace_id is null;
update public.org_document_completions c set workspace_id=d.workspace_id from public.org_documents d
where d.id=c.document_id and c.workspace_id is null;
update public.marketplace_orders o set workspace_id=i.workspace_id from public.marketplace_items i
where i.id=o.item_id and o.workspace_id is null;

create or replace function public.enforce_workspace_record_owner()
returns trigger language plpgsql security definer set search_path=public as $$
declare workspace_row public.business_workspaces%rowtype; payload jsonb:=to_jsonb(new); record_org uuid; record_coach uuid;
begin
  if new.workspace_id is null then return new; end if;
  select * into workspace_row from public.business_workspaces where id=new.workspace_id and status<>'archived';
  if not found then raise exception 'Workspace is unavailable'; end if;
  if payload ? 'org_id' and nullif(payload->>'org_id','') is not null then record_org:=(payload->>'org_id')::uuid; end if;
  if payload ? 'coach_id' and nullif(payload->>'coach_id','') is not null then record_coach:=(payload->>'coach_id')::uuid; end if;
  if record_org is not null and workspace_row.organization_id is distinct from record_org then
    raise exception 'Organization record cannot cross workspaces';
  end if;
  if workspace_row.workspace_type='independent_coach' and record_coach is not null
     and workspace_row.owner_user_id is distinct from record_coach then
    raise exception 'Independent coach record cannot cross workspaces';
  end if;
  if workspace_row.workspace_type='organization' and record_coach is not null
     and not public.workspace_has_role(workspace_row.id,'coach',record_coach)
     and not public.workspace_has_role(workspace_row.id,'assistant_coach',record_coach) then
    raise exception 'Coach does not belong to this organization workspace';
  end if;
  return new;
end $$;

create or replace function public.assign_active_workspace()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.workspace_id is null and auth.uid() is not null then
    new.workspace_id:=public.current_active_workspace_id(auth.uid());
  end if;
  return new;
end $$;

do $$ declare t text;
begin
  foreach t in array array['sessions','coach_waivers','marketplace_items','coach_fee_assignments','coach_availability_blocks','programs','bookings','session_bookings'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists assign_active_workspace_trigger on public.%I',t);
      execute format('create trigger assign_active_workspace_trigger before insert on public.%I for each row execute function public.assign_active_workspace()',t);
      execute format('drop trigger if exists enforce_workspace_owner_trigger on public.%I',t);
      execute format('create trigger enforce_workspace_owner_trigger before insert or update on public.%I for each row execute function public.enforce_workspace_record_owner()',t);
    end if;
  end loop;
end $$;

create or replace view public.workspace_reconciliation_queue as
select 'sessions'::text table_name,id,created_at from public.sessions where workspace_id is null
union all select 'coach_waivers',id,created_at from public.coach_waivers where workspace_id is null
union all select 'org_documents',id,created_at from public.org_documents where workspace_id is null
union all select 'marketplace_items',id,created_at from public.marketplace_items where workspace_id is null
union all select 'coach_fee_assignments',id,created_at from public.coach_fee_assignments where workspace_id is null
union all select 'org_fee_assignments',id,created_at from public.org_fee_assignments where workspace_id is null
union all select 'programs',id,created_at from public.programs where workspace_id is null;
revoke all on public.workspace_reconciliation_queue from public,anon,authenticated;
grant select on public.workspace_reconciliation_queue to service_role;

do $$ declare t text; has_org boolean;
begin
  foreach t in array array['sessions','org_documents','org_fee_assignments'] loop
    if to_regclass('public.'||t) is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='org_id') then
      execute format('update public.%I r set workspace_id=w.id from public.business_workspaces w where w.organization_id=r.org_id and r.workspace_id is null',t);
    end if;
  end loop;
  foreach t in array array['coach_waivers','marketplace_items','coach_fee_assignments','coach_availability_blocks'] loop
    if to_regclass('public.'||t) is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='coach_id') then
      select exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='org_id') into has_org;
      if has_org then
        execute format('update public.%I r set workspace_id=coalesce((select w.id from public.business_workspaces w where w.organization_id=r.org_id),(select w.id from public.business_workspaces w where w.workspace_type=''independent_coach'' and w.owner_user_id=r.coach_id)) where r.workspace_id is null',t);
      else
        execute format('update public.%I r set workspace_id=(select w.id from public.business_workspaces w where w.workspace_type=''independent_coach'' and w.owner_user_id=r.coach_id) where r.workspace_id is null',t);
      end if;
    end if;
  end loop;
end $$;

create or replace function public.available_workspaces()
returns table(workspace_id uuid,workspace_type text,display_name text,organization_id uuid,roles text[],permissions jsonb,is_last_used boolean)
language sql stable security definer set search_path=public as $$
  select w.id,w.workspace_type,w.display_name,w.organization_id,m.roles,m.permissions,(p.workspace_id=w.id)
  from public.workspace_memberships m join public.business_workspaces w on w.id=m.workspace_id
  left join public.active_workspace_preferences p on p.user_id=auth.uid()
  where m.user_id=auth.uid() and m.status='active' and w.status<>'archived'
  order by (p.workspace_id=w.id) desc,w.display_name
$$;
revoke all on function public.available_workspaces() from public,anon;
grant execute on function public.available_workspaces() to authenticated;

create or replace function public.current_active_workspace_id(p_user_id uuid default auth.uid())
returns uuid language sql stable security definer set search_path=public as $$
  select p.workspace_id from public.active_workspace_preferences p
  join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.user_id=p.user_id and m.status='active'
  where p.user_id=p_user_id
$$;
revoke all on function public.current_active_workspace_id(uuid) from public,anon;
grant execute on function public.current_active_workspace_id(uuid) to authenticated;

-- Restrictive policies are ANDed with existing role policies. Legacy rows and
-- users without a selected workspace remain compatible during rollout; once a
-- workspace is selected, operational queries cannot leak a different context.
do $$ declare t text;
begin
  foreach t in array array['sessions','coach_waivers','coach_waiver_assignments','org_documents','org_document_completions',
    'messages','conversations','org_fee_assignments','coach_fee_assignments','coach_availability_blocks','program_registrations',
    'training_plans','coach_notes','bookings','session_bookings'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists workspace_context_isolation on public.%I',t);
      execute format('create policy workspace_context_isolation on public.%I as restrictive for all to authenticated using (workspace_id is null or public.current_active_workspace_id() is null or workspace_id=public.current_active_workspace_id()) with check (workspace_id is null or public.current_active_workspace_id() is null or workspace_id=public.current_active_workspace_id())',t);
    end if;
  end loop;
end $$;

create or replace function public.set_active_workspace(p_workspace_id uuid,p_acting_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.workspace_has_role(p_workspace_id,p_acting_role) then raise exception 'Workspace role is not available'; end if;
  insert into public.active_workspace_preferences(user_id,workspace_id,acting_role,updated_at)
  values(auth.uid(),p_workspace_id,p_acting_role,now()) on conflict(user_id) do update
  set workspace_id=excluded.workspace_id,acting_role=excluded.acting_role,updated_at=now();
  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type)
  values(p_workspace_id,auth.uid(),p_acting_role,'workspace_switched');
end $$;
revoke all on function public.set_active_workspace(uuid,text) from public,anon;
grant execute on function public.set_active_workspace(uuid,text) to authenticated;

create or replace function public.enable_organization_owner_coaching(p_workspace_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.workspace_has_role(p_workspace_id,'org_admin') then raise exception 'Organization administrator access required'; end if;
  update public.workspace_memberships set roles=(select array_agg(distinct r) from unnest(roles||array['coach']) r),updated_at=now()
    where workspace_id=p_workspace_id and user_id=auth.uid();
  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type)
  values(p_workspace_id,auth.uid(),'org_admin','organization_coaching_enabled');
end $$;

create or replace function public.activate_independent_workspace()
returns uuid language plpgsql security definer set search_path=public as $$
declare workspace_uuid uuid;
begin
  insert into public.independent_coach_profiles(coach_id,is_active) values(auth.uid(),true)
    on conflict(coach_id) do update set is_active=true,updated_at=now();
  insert into public.business_workspaces(workspace_type,owner_user_id,display_name)
    values('independent_coach',auth.uid(),coalesce((select nullif(trim(full_name),'') from public.profiles where id=auth.uid()),'Independent Coaching'))
    on conflict(owner_user_id) where workspace_type='independent_coach' do update set status='active',updated_at=now()
    returning id into workspace_uuid;
  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status)
    values(workspace_uuid,auth.uid(),array['owner','coach'],
      '{"manage_members":true,"approve_athletes":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true,"manage_connect":true,"send_documents":true,"view_audit":true,"export_records":true}','active')
    on conflict(workspace_id,user_id) do update set roles=excluded.roles,permissions=excluded.permissions,status='active';
  return workspace_uuid;
end $$;

create or replace function public.request_workspace_athlete_access(p_workspace_id uuid,p_athlete_id uuid,p_athlete_email text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare request_id uuid;
begin
  if not public.workspace_has_permission(p_workspace_id,'request_athletes') then raise exception 'Athlete requests are not permitted'; end if;
  insert into public.athlete_access_requests(workspace_id,requested_by,athlete_id,athlete_email,reason)
  values(p_workspace_id,auth.uid(),p_athlete_id,nullif(lower(trim(p_athlete_email)),''),nullif(trim(p_reason),'')) returning id into request_id;
  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type,record_type,record_id)
  values(p_workspace_id,auth.uid(),'coach','athlete_access_requested','athlete_access_request',request_id);
  return request_id;
end $$;

create or replace function public.review_workspace_athlete_access(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r public.athlete_access_requests%rowtype; relation_type text; resolved_athlete_id uuid; target_org_id uuid;
begin
  select * into r from public.athlete_access_requests where id=p_request_id for update;
  if not found or (not public.workspace_has_permission(r.workspace_id,'approve_athletes') and not public.is_admin(auth.uid())) then raise exception 'Athlete approval access required'; end if;
  if r.status<>'requested' then raise exception 'Request has already been reviewed'; end if;
  update public.athlete_access_requests set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
  if p_approve and r.athlete_id is not null then
    resolved_athlete_id:=r.athlete_id;
  elsif p_approve and r.athlete_email is not null then
    select ap.id into resolved_athlete_id from public.profiles p join public.athlete_profiles ap on ap.owner_user_id=p.id
      where lower(p.email)=lower(r.athlete_email) order by ap.is_primary desc,ap.created_at limit 1;
  end if;
  if p_approve and resolved_athlete_id is not null then
    select case when workspace_type='organization' then 'organization_member' else 'independent_client' end into relation_type
      from public.business_workspaces where id=r.workspace_id;
    insert into public.workspace_athlete_relationships(workspace_id,athlete_id,relationship_type,status,approved_by)
      values(r.workspace_id,resolved_athlete_id,relation_type,'active',auth.uid())
      on conflict(workspace_id,athlete_id) do update set status='active',approved_by=auth.uid(),updated_at=now();
    update public.athlete_access_requests set athlete_id=resolved_athlete_id where id=r.id;
  elsif p_approve and r.athlete_email is not null then
    select organization_id into target_org_id from public.business_workspaces where id=r.workspace_id;
    if target_org_id is not null then
      insert into public.org_invites(org_id,role,invited_email,status)
      values(target_org_id,'athlete',lower(r.athlete_email),'pending');
    end if;
  end if;
  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type,record_type,record_id)
  values(r.workspace_id,auth.uid(),'org_admin',case when p_approve then 'athlete_access_approved' else 'athlete_access_rejected' end,'athlete_access_request',r.id);
end $$;

revoke all on function public.enable_organization_owner_coaching(uuid),public.activate_independent_workspace(),
  public.request_workspace_athlete_access(uuid,uuid,text,text),public.review_workspace_athlete_access(uuid,boolean) from public,anon;
grant execute on function public.enable_organization_owner_coaching(uuid),public.activate_independent_workspace(),
  public.request_workspace_athlete_access(uuid,uuid,text,text),public.review_workspace_athlete_access(uuid,boolean) to authenticated;

create or replace function public.admin_workspace_reconciliation()
returns table(record_table text,record_id uuid,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
    select q.table_name,q.id,q.created_at
    from public.workspace_reconciliation_queue q
    order by q.created_at desc;
end $$;

create or replace function public.admin_user_workspace_context(p_user_id uuid)
returns table(workspace_id uuid,workspace_type text,display_name text,workspace_status text,
  organization_id uuid,roles text[],permissions jsonb,is_active boolean,acting_role text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
    select w.id,w.workspace_type,w.display_name,w.status,w.organization_id,m.roles,m.permissions,
      coalesce(p.workspace_id=w.id,false),case when p.workspace_id=w.id then p.acting_role else null end
    from public.workspace_memberships m
    join public.business_workspaces w on w.id=m.workspace_id
    left join public.active_workspace_preferences p on p.user_id=m.user_id
    where m.user_id=p_user_id
    order by coalesce(p.workspace_id=w.id,false) desc,w.display_name;
end $$;

revoke all on function public.admin_workspace_reconciliation(),public.admin_user_workspace_context(uuid) from public,anon;
grant execute on function public.admin_workspace_reconciliation(),public.admin_user_workspace_context(uuid) to authenticated;
