begin;

-- Staff removal must revoke every invitation identity that could otherwise
-- restore access, including duplicate attempts recorded by user id or email.
create or replace function public.update_my_org_member_access(
  p_org_id uuid, p_membership_id uuid, p_role text default null, p_remove boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_target uuid;
  v_workspace uuid;
  v_roles text[];
  v_target_roles text[];
  v_actor_roles text[];
  v_permissions jsonb;
  v_actor_is_admin boolean;
  v_target_is_admin boolean;
  v_target_email text;
begin
  if auth.uid() is null or not public.can_manage_org_staff(p_org_id,auth.uid()) then
    raise exception 'organization_staff_management_required' using errcode='42501';
  end if;

  select user_id into v_target
  from public.organization_memberships
  where id=p_membership_id and org_id=p_org_id
  for update;
  if v_target is null then raise exception 'organization_membership_not_found'; end if;
  if v_target=auth.uid() then raise exception 'cannot_modify_your_own_access' using errcode='42501'; end if;

  select id into v_workspace
  from public.business_workspaces
  where organization_id=p_org_id and workspace_type='organization' and status='active'
  order by created_at limit 1;
  if v_workspace is null then raise exception 'organization_workspace_not_found'; end if;

  select coalesce(roles,'{}'::text[]) into v_actor_roles
  from public.workspace_memberships
  where workspace_id=v_workspace and user_id=auth.uid() and status='active';
  select coalesce(roles,'{}'::text[]) into v_target_roles
  from public.workspace_memberships
  where workspace_id=v_workspace and user_id=v_target;

  v_actor_is_admin := public.is_admin(auth.uid())
    or coalesce(v_actor_roles,'{}'::text[]) && array['owner','org_admin','admin']::text[]
    or exists (
      select 1 from public.organization_memberships
      where org_id=p_org_id and user_id=auth.uid() and status='active'
        and role in ('owner','org_admin','admin')
    );
  v_target_is_admin := coalesce(v_target_roles,'{}'::text[]) && array['owner','org_admin','admin']::text[]
    or exists (
      select 1 from public.organization_memberships
      where org_id=p_org_id and user_id=v_target and status='active'
        and role in ('owner','org_admin','admin')
    );

  p_role := case lower(trim(p_role)) when 'admin' then 'org_admin' else lower(trim(p_role)) end;
  if not p_remove and p_role not in ('org_admin','program_director','team_manager','coach','assistant_coach') then
    raise exception 'unsupported_organization_role';
  end if;
  if (v_target_is_admin or p_role='org_admin') and not v_actor_is_admin then
    raise exception 'organization_admin_role_required' using errcode='42501';
  end if;

  if p_remove then
    select coalesce(nullif(trim(profile.email),''),nullif(trim(auth_user.email),''))
      into v_target_email
    from auth.users auth_user
    left join public.profiles profile on profile.id=auth_user.id
    where auth_user.id=v_target;
    update public.workspace_memberships
      set roles='{}'::text[],permissions='{}'::jsonb,status='removed',updated_at=now()
      where workspace_id=v_workspace and user_id=v_target;
    delete from public.organization_memberships where org_id=p_org_id and user_id=v_target;
    update public.org_invites
      set status='canceled',updated_at=now()
      where org_id=p_org_id
        and status in ('draft','pending_approval','awaiting_approval','pending','failed','approved','accepted')
        and (
          invited_user_id=v_target
          or accepted_by=v_target
          or (v_target_email is not null and lower(trim(invited_email))=lower(trim(v_target_email)))
        );
    delete from public.org_team_coaches where coach_id=v_target and team_id in(select id from public.org_teams where org_id=p_org_id);
    delete from public.org_program_coaches where coach_id=v_target and program_id in(select id from public.programs where org_id=p_org_id);
    delete from public.org_tryout_coaches where coach_id=v_target and tryout_id in(select id from public.org_tryouts where org_id=p_org_id);
    delete from public.org_training_package_coaches where coach_id=v_target and package_id in(select id from public.org_training_packages where org_id=p_org_id);
    delete from public.org_training_session_coaches where coach_id=v_target and session_id in(select id from public.org_training_sessions where org_id=p_org_id);
    return jsonb_build_object('ok',true,'status','removed','user_id',v_target);
  end if;

  update public.organization_memberships
    set role=p_role,status='active',updated_at=now()
    where org_id=p_org_id and user_id=v_target;
  v_roles:=array[p_role]::text[];
  v_permissions:=public.organization_permissions_for_roles(v_roles);
  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
  values(v_workspace,v_target,v_roles,v_permissions,'active',now())
  on conflict(workspace_id,user_id) do update set
    roles=excluded.roles,permissions=excluded.permissions,status='active',updated_at=now();
  return jsonb_build_object('ok',true,'status','active','user_id',v_target,'role',p_role);
end $$;

revoke all on function public.update_my_org_member_access(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.update_my_org_member_access(uuid,uuid,text,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
