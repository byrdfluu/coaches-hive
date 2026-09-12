-- Optional multi-role access for leagues. League roles never imply organization
-- or team access; every additional scope is explicitly invited and accepted.

create table if not exists public.league_access_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  default_access text not null default 'league_only' check(default_access='league_only'),
  invitations_required boolean not null default true,
  combined_roles_allowed boolean not null default true,
  secondary_approval_required boolean not null default false,
  assigner_roles text[] not null default array['league_admin']::text[],
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.league_access_invitations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  invited_email text not null,
  target_role text not null check(target_role in (
    'league_admin','division_admin','organization_director','team_manager','coach',
    'finance_manager','registrar','compliance_manager','read_only_auditor')),
  scope_type text not null check(scope_type in ('league','division','organization','team')),
  scope_id uuid not null,
  request_type text not null default 'invitation' check(request_type in ('invitation','access_request')),
  status text not null default 'pending' check(status in ('pending_approval','pending','accepted','declined','revoked')),
  requested_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  responded_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz, responded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((scope_type='league' and scope_id=league_id) or scope_type<>'league')
);
create unique index if not exists league_access_invitation_pending_uidx
  on public.league_access_invitations(league_id,lower(invited_email),target_role,scope_type,scope_id)
  where status in ('pending','pending_approval');
create index if not exists league_access_invitation_email_idx
  on public.league_access_invitations(lower(invited_email),status,created_at desc);

insert into public.league_access_settings(league_id)
select id from public.leagues on conflict(league_id) do nothing;

alter table public.league_access_settings enable row level security;
alter table public.league_access_invitations enable row level security;
create policy league_access_settings_context_read on public.league_access_settings for select to authenticated
  using(public.user_has_league_context(league_id) or public.is_admin(auth.uid()));
create policy league_access_settings_admin_manage on public.league_access_settings for all to authenticated
  using(public.is_league_admin(league_id) or public.is_admin(auth.uid()))
  with check(public.is_league_admin(league_id) or public.is_admin(auth.uid()));
create policy league_access_invites_scoped_read on public.league_access_invitations for select to authenticated using(
  public.is_league_admin(league_id) or public.is_admin(auth.uid()) or requested_by=auth.uid()
  or lower(invited_email)=lower(public.current_user_email()));

create or replace function public.can_assign_league_access(p_league_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_league_admin(p_league_id,p_user_id) or exists(
    select 1 from league_memberships lm join league_access_settings s on s.league_id=lm.league_id
    where lm.league_id=p_league_id and lm.user_id=p_user_id and lm.status='active' and lm.role=any(s.assigner_roles));
$$;

create or replace function public.apply_league_access_invitation(p_invite_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.league_access_invitations%rowtype; v_user uuid; v_workspace uuid; v_org uuid; v_roles text[];
begin
  select * into r from league_access_invitations where id=p_invite_id for update;
  if not found or r.status<>'pending' then raise exception 'Invitation is not ready to accept'; end if;
  if lower(r.invited_email)<>lower(public.current_user_email()) then raise exception 'Invitation belongs to another email'; end if;
  v_user:=auth.uid();
  if r.scope_type='league' then
    insert into league_memberships(league_id,user_id,role,status) values(r.league_id,v_user,r.target_role,'active')
    on conflict(league_id,user_id) do update set role=excluded.role,status='active',updated_at=now();
    select id into v_workspace from business_workspaces where league_id=r.league_id and workspace_type='league';
    v_roles:=array[r.target_role];
  elsif r.scope_type='organization' then
    v_org:=r.scope_id;
    insert into organization_memberships(user_id,org_id,role,status)
    values(v_user,v_org,case when r.target_role='organization_director' then 'org_admin' else r.target_role end,'active')
    on conflict(user_id,org_id,role) do update set status='active',updated_at=now();
    select id into v_workspace from business_workspaces where organization_id=v_org and workspace_type='organization';
    v_roles:=array[case when r.target_role='organization_director' then 'org_admin' else r.target_role end];
  elsif r.scope_type='team' then
    select org_id into v_org from org_teams where id=r.scope_id;
    if v_org is null or not exists(select 1 from league_team_assignments where league_id=r.league_id and team_id=r.scope_id and status='active') then
      raise exception 'Team is not active in this league';
    end if;
    insert into organization_memberships(user_id,org_id,role,status) values(v_user,v_org,r.target_role,'active')
    on conflict(user_id,org_id,role) do update set status='active',updated_at=now();
    if r.target_role in ('coach','team_manager') then
      insert into org_team_coaches(team_id,coach_id) values(r.scope_id,v_user) on conflict(team_id,coach_id) do nothing;
    end if;
    select id into v_workspace from business_workspaces where organization_id=v_org and workspace_type='organization';
    v_roles:=array[r.target_role];
  else
    insert into league_memberships(league_id,user_id,role,status) values(r.league_id,v_user,'division_admin','active')
    on conflict(league_id,user_id) do update set role='division_admin',status='active',updated_at=now();
    select id into v_workspace from business_workspaces where league_id=r.league_id and workspace_type='league';
    v_roles:=array['division_admin'];
    insert into league_permissions(league_id,membership_id,scope_type,scope_id,permissions)
    select r.league_id,m.id,'division',r.scope_id,'{"manage_division":true}'::jsonb from league_memberships m
    where m.league_id=r.league_id and m.user_id=v_user
    on conflict(membership_id,scope_type,scope_id) do update set permissions=excluded.permissions;
  end if;
  if v_workspace is not null then
    insert into workspace_memberships(workspace_id,user_id,roles,permissions,status)
    values(v_workspace,v_user,v_roles,'{}','active') on conflict(workspace_id,user_id) do update
    set roles=(select array_agg(distinct x) from unnest(workspace_memberships.roles||excluded.roles) x),status='active',updated_at=now();
  end if;
  update league_access_invitations set status='accepted',responded_by=v_user,responded_at=now(),updated_at=now() where id=r.id;
  insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata)
  values(r.league_id,v_user,'access_invitation_accepted','league_access_invitation',r.id,jsonb_build_object('role',r.target_role,'scope_type',r.scope_type,'scope_id',r.scope_id));
end $$;

create or replace function public.create_league_access_invitation(
  p_league_id uuid,p_email text,p_role text,p_scope_type text,p_scope_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_status text; s league_access_settings%rowtype;
begin
  if not public.can_assign_league_access(p_league_id) then raise exception 'Access assignment permission required'; end if;
  if not ((p_scope_type='league' and p_role in ('league_admin','finance_manager','registrar','compliance_manager','read_only_auditor'))
       or (p_scope_type='division' and p_role='division_admin')
       or (p_scope_type='organization' and p_role='organization_director')
       or (p_scope_type='team' and p_role in ('coach','team_manager'))) then raise exception 'Role is invalid for the selected scope'; end if;
  select * into s from league_access_settings where league_id=p_league_id;
  v_status:=case when coalesce(s.secondary_approval_required,false) then 'pending_approval' else 'pending' end;
  insert into league_access_invitations(league_id,invited_email,target_role,scope_type,scope_id,status,created_by)
  values(p_league_id,lower(trim(p_email)),p_role,p_scope_type,p_scope_id,v_status,auth.uid()) returning id into v_id;
  insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata)
  values(p_league_id,auth.uid(),'access_invitation_created','league_access_invitation',v_id,jsonb_build_object('role',p_role,'scope_type',p_scope_type));
  return v_id;
end $$;

create or replace function public.request_league_access(p_league_id uuid,p_role text,p_scope_type text,p_scope_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.user_has_league_context(p_league_id) then raise exception 'League relationship required'; end if;
  if not ((p_scope_type='league' and p_role in ('league_admin','finance_manager','registrar','compliance_manager','read_only_auditor'))
       or (p_scope_type='division' and p_role='division_admin')
       or (p_scope_type='organization' and p_role='organization_director')
       or (p_scope_type='team' and p_role in ('coach','team_manager'))) then raise exception 'Role is invalid for the selected scope'; end if;
  insert into league_access_invitations(league_id,invited_email,target_role,scope_type,scope_id,request_type,status,requested_by)
  values(p_league_id,lower(public.current_user_email()),p_role,p_scope_type,p_scope_id,'access_request','pending_approval',auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.review_league_access_invitation(p_invite_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r league_access_invitations%rowtype;
begin
  select * into r from league_access_invitations where id=p_invite_id for update;
  if not found or not public.can_assign_league_access(r.league_id) then raise exception 'Access assignment permission required'; end if;
  if r.status not in ('pending_approval','pending') then raise exception 'Invitation cannot be reviewed'; end if;
  if r.status='pending_approval' and r.created_by=auth.uid() then raise exception 'Secondary approval must come from another authorized administrator'; end if;
  update league_access_invitations set status=case when p_approve then 'pending' else 'revoked' end,
    approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=r.id;
end $$;

create or replace function public.revoke_league_access_invitation(p_invite_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r league_access_invitations%rowtype; v_user uuid; v_org uuid; v_workspace uuid; v_role text;
begin
  select * into r from league_access_invitations where id=p_invite_id for update;
  if not found or not public.can_assign_league_access(r.league_id) then raise exception 'Access assignment permission required'; end if;
  select id into v_user from profiles where lower(email)=lower(r.invited_email);
  if r.status='accepted' and v_user is not null then
    if r.scope_type in ('league','division') then
      delete from league_memberships where league_id=r.league_id and user_id=v_user;
      select id into v_workspace from business_workspaces where league_id=r.league_id;
    elsif r.scope_type='organization' then
      v_org:=r.scope_id; v_role:=case when r.target_role='organization_director' then 'org_admin' else r.target_role end;
      update organization_memberships set status='removed',updated_at=now() where org_id=v_org and user_id=v_user and role=v_role;
      select id into v_workspace from business_workspaces where organization_id=v_org;
    elsif r.scope_type='team' then
      select org_id into v_org from org_teams where id=r.scope_id;
      delete from org_team_coaches where team_id=r.scope_id and coach_id=v_user;
      update organization_memberships set status='removed',updated_at=now() where org_id=v_org and user_id=v_user and role=r.target_role;
      select id into v_workspace from business_workspaces where organization_id=v_org;
    end if;
    if v_workspace is not null then
      update workspace_memberships set roles=array_remove(roles,case when r.target_role='organization_director' then 'org_admin' else r.target_role end),updated_at=now()
      where workspace_id=v_workspace and user_id=v_user;
    end if;
  end if;
  update league_access_invitations set status='revoked',updated_at=now() where id=r.id;
  insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id)
  values(r.league_id,auth.uid(),'access_revoked','league_access_invitation',r.id);
end $$;

create or replace function public.respond_league_access_invitation(p_invite_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_accept then perform public.apply_league_access_invitation(p_invite_id);
  else update league_access_invitations set status='declined',responded_by=auth.uid(),responded_at=now(),updated_at=now()
    where id=p_invite_id and status='pending' and lower(invited_email)=lower(public.current_user_email());
  end if;
end $$;

revoke all on function public.apply_league_access_invitation(uuid),public.create_league_access_invitation(uuid,text,text,text,uuid),
  public.request_league_access(uuid,text,text,uuid),public.review_league_access_invitation(uuid,boolean),
  public.respond_league_access_invitation(uuid,boolean),public.revoke_league_access_invitation(uuid),public.can_assign_league_access(uuid,uuid) from public,anon;
grant execute on function public.create_league_access_invitation(uuid,text,text,text,uuid),
  public.request_league_access(uuid,text,text,uuid),public.review_league_access_invitation(uuid,boolean),
  public.respond_league_access_invitation(uuid,boolean),public.revoke_league_access_invitation(uuid) to authenticated;

create or replace function public.my_coach_team_contexts()
returns table(workspace_id uuid,organization_id uuid,organization_name text,team_id uuid,team_name text)
language sql stable security definer set search_path=public as $$
  select distinct w.id,w.organization_id,w.display_name,t.id,t.name
  from business_workspaces w
  join workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=auth.uid() and wm.status='active' and 'coach'=any(wm.roles)
  join org_teams t on t.org_id=w.organization_id
  join org_team_coaches tc on tc.team_id=t.id and tc.coach_id=auth.uid()
  where w.workspace_type='organization' and w.status<>'archived'
  order by w.display_name,t.name;
$$;
revoke all on function public.my_coach_team_contexts() from public,anon;
grant execute on function public.my_coach_team_contexts() to authenticated;
