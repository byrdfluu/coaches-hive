-- Atomically keep legacy organization membership and workspace authority in sync.
-- Backend-only: callers cannot supply a different actor through the public API.

create or replace function public.update_org_member_access_atomic(
  p_actor_id uuid,
  p_org_id uuid,
  p_membership_id uuid,
  p_role text default null,
  p_remove boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor_role text;
  v_target_user_id uuid;
  v_workspace_id uuid;
  v_workspace_roles text[];
  v_permissions jsonb;
begin
  select role into v_actor_role from public.organization_memberships
  where org_id=p_org_id and user_id=p_actor_id and coalesce(status,'active')='active'
  order by created_at limit 1;
  if v_actor_role not in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director') then
    raise exception 'Organization administrator access required';
  end if;

  select user_id into v_target_user_id from public.organization_memberships
  where id=p_membership_id and org_id=p_org_id for update;
  if v_target_user_id is null then raise exception 'Organization membership not found'; end if;
  if v_target_user_id=p_actor_id and p_remove then raise exception 'You cannot remove your own administrator access'; end if;

  select id into v_workspace_id from public.business_workspaces
  where organization_id=p_org_id and workspace_type='organization' limit 1;
  if v_workspace_id is null then raise exception 'Organization workspace not found'; end if;

  if p_remove then
    update public.organization_memberships set status='suspended',updated_at=now()
    where id=p_membership_id and org_id=p_org_id;
    update public.workspace_memberships set status='removed',updated_at=now()
    where workspace_id=v_workspace_id and user_id=v_target_user_id;
    return jsonb_build_object('ok',true,'membership_id',p_membership_id,'user_id',v_target_user_id,'status','removed');
  end if;

  if p_role not in ('org_admin','program_director','team_manager','coach','assistant_coach') then
    raise exception 'Unsupported organization role';
  end if;

  update public.organization_memberships set role=p_role,status='active',updated_at=now()
  where id=p_membership_id and org_id=p_org_id;

  v_workspace_roles := case p_role
    when 'org_admin' then array['org_admin']::text[]
    when 'program_director' then array['org_admin']::text[]
    when 'team_manager' then array['team_manager']::text[]
    when 'assistant_coach' then array['assistant_coach']::text[]
    else array['coach']::text[] end;
  v_permissions := case p_role
    when 'org_admin' then '{"manage_members":true,"approve_athletes":true,"manage_teams":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true,"manage_connect":true,"send_documents":true,"view_audit":true,"export_records":true}'::jsonb
    when 'program_director' then '{"manage_members":true,"approve_athletes":true,"manage_teams":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true,"send_documents":true,"view_audit":true,"export_records":true}'::jsonb
    when 'team_manager' then '{"approve_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb
    when 'coach' then '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb
    when 'assistant_coach' then '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb
    else '{"view_assigned_athletes":true}'::jsonb end;

  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
  values(v_workspace_id,v_target_user_id,v_workspace_roles,v_permissions,'active',now())
  on conflict(workspace_id,user_id) do update set
    roles=excluded.roles,permissions=excluded.permissions,status='active',updated_at=now();

  return jsonb_build_object('ok',true,'membership_id',p_membership_id,'user_id',v_target_user_id,'role',p_role,'status','active');
end;
$$;

revoke all on function public.update_org_member_access_atomic(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.update_org_member_access_atomic(uuid,uuid,uuid,text,boolean) to service_role;
