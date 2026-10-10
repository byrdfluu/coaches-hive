begin;

-- An accepted invitation may be retried only while the access it provisioned
-- is still active. Once staff are removed, the consumed invitation can never
-- recreate their organization or workspace membership.
create or replace function public.accept_org_invite(
  invite_id uuid,
  athlete_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.org_invites%rowtype;
  v_membership_id uuid;
  v_athlete_id uuid;
  v_workspace_id uuid;
  v_requested_roles text[];
  v_existing_roles text[];
  v_effective_roles text[];
  v_primary_role text;
  v_permissions jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into r
  from public.org_invites
  where id = invite_id
    and lower(trim(invited_email)) = public.current_user_email()
    and status in ('pending','accepted')
    and (accepted_by is null or accepted_by = auth.uid())
  for update;

  if not found then
    raise exception 'invite_not_found_or_not_available';
  end if;

  select id into v_workspace_id
  from public.business_workspaces
  where organization_id = r.org_id
    and workspace_type = 'organization'
    and status = 'active'
  order by created_at
  limit 1;
  if v_workspace_id is null then
    raise exception 'organization_workspace_unavailable';
  end if;

  -- Network retries after a successful acceptance return the existing access.
  -- They never reprovision a membership that was subsequently removed.
  if r.status = 'accepted' then
    select membership.id into v_membership_id
    from public.organization_memberships membership
    where membership.user_id = auth.uid()
      and membership.org_id = r.org_id
      and membership.status = 'active'
      and exists (
        select 1 from public.workspace_memberships workspace_membership
        where workspace_membership.workspace_id = v_workspace_id
          and workspace_membership.user_id = auth.uid()
          and workspace_membership.status = 'active'
      )
    order by membership.created_at
    limit 1;

    if v_membership_id is null then
      raise exception 'invite_already_consumed_access_removed' using errcode = '42501';
    end if;
    return v_membership_id;
  end if;

  select coalesce(array_agg(distinct normalized_role order by normalized_role), '{}'::text[])
  into v_requested_roles
  from (
    select case lower(trim(role_name)) when 'admin' then 'org_admin' else lower(trim(role_name)) end normalized_role
    from unnest(
      case when cardinality(coalesce(r.requested_workspace_roles, '{}'::text[])) > 0
        then r.requested_workspace_roles
        else array[coalesce(nullif(r.role, ''), 'athlete')]::text[]
      end
    ) role_name
  ) normalized
  where normalized_role in ('org_admin','program_director','team_manager','coach','assistant_coach','athlete');

  if cardinality(v_requested_roles) = 0 then
    raise exception 'invitation_has_no_supported_role';
  end if;

  v_primary_role := case
    when 'org_admin' = any(v_requested_roles) then 'org_admin'
    when 'program_director' = any(v_requested_roles) then 'program_director'
    when 'team_manager' = any(v_requested_roles) then 'team_manager'
    when 'coach' = any(v_requested_roles) then 'coach'
    when 'assistant_coach' = any(v_requested_roles) then 'assistant_coach'
    else 'athlete'
  end;

  select id into v_membership_id
  from public.organization_memberships
  where user_id = auth.uid() and org_id = r.org_id
  order by case when status = 'active' then 0 else 1 end, created_at
  limit 1 for update;

  if v_membership_id is null then
    insert into public.organization_memberships(user_id, org_id, role, status)
    values(auth.uid(), r.org_id, v_primary_role, 'active')
    returning id into v_membership_id;
  else
    update public.organization_memberships
    set role = v_primary_role, status = 'active', updated_at = now()
    where id = v_membership_id;
  end if;

  select coalesce(roles, '{}'::text[]) into v_existing_roles
  from public.workspace_memberships
  where workspace_id = v_workspace_id and user_id = auth.uid()
  for update;

  select coalesce(array_agg(distinct role_name order by role_name), '{}'::text[])
  into v_effective_roles
  from unnest(coalesce(v_existing_roles, '{}'::text[]) || v_requested_roles) role_name
  where role_name in ('owner','org_admin','program_director','team_manager','coach','assistant_coach','athlete');

  v_permissions := public.organization_permissions_for_roles(v_effective_roles);
  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
  values(v_workspace_id,auth.uid(),v_effective_roles,v_permissions,'active',now())
  on conflict(workspace_id,user_id) do update set
    roles=excluded.roles,
    permissions=excluded.permissions,
    status='active', updated_at=now();

  if 'athlete' = any(v_requested_roles) then
    select id into v_athlete_id
    from public.athlete_profiles
    where owner_user_id=auth.uid() and (athlete_profile_id is null or id=athlete_profile_id)
    order by case when id=athlete_profile_id then 0 else 1 end, is_primary desc, created_at
    limit 1;
    if v_athlete_id is null then raise exception 'athlete_profile_required'; end if;
    insert into public.athlete_organization_memberships(athlete_id,org_id,status)
    values(v_athlete_id,r.org_id,'active')
    on conflict(athlete_id,org_id) do update set status='active',updated_at=now();
  end if;

  if r.team_id is not null and v_requested_roles && array['coach','assistant_coach','program_director']::text[] then
    if not exists(select 1 from public.org_teams where id=r.team_id and org_id=r.org_id) then
      raise exception 'invite_team_does_not_belong_to_organization';
    end if;
    insert into public.org_team_coaches(team_id,coach_id)
    values(r.team_id,auth.uid()) on conflict(team_id,coach_id) do nothing;
  end if;

  update public.org_invites
  set status='accepted', accepted_by=auth.uid(),
      accepted_at=coalesce(accepted_at,now()), updated_at=now()
  where id=r.id;

  perform public.notify_user(auth.uid(),'Invite accepted','You joined the organization.','invite',r.id);
  return v_membership_id;
end;
$$;

revoke all on function public.accept_org_invite(uuid,uuid) from public,anon;
grant execute on function public.accept_org_invite(uuid,uuid) to authenticated;

-- Program directors may manage operational staff, but only an owner/admin can
-- grant admin access or modify another owner/admin. Nobody can elevate or
-- remove their own membership through this administrative RPC.
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
    select email into v_target_email from public.profiles where id=v_target;
    update public.workspace_memberships
      set roles='{}'::text[],permissions='{}'::jsonb,status='removed',updated_at=now()
      where workspace_id=v_workspace and user_id=v_target;
    delete from public.organization_memberships where org_id=p_org_id and user_id=v_target;
    update public.org_invites
      set status='revoked',updated_at=now()
      where org_id=p_org_id
        and status in ('draft','pending_approval','pending','accepted')
        and (accepted_by=v_target or (v_target_email is not null and lower(trim(invited_email))=lower(trim(v_target_email))));
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

-- Remove stale permission grants from prior role mappings. Multi-role users
-- keep the union implied by their roles; org_admin + program_director remains
-- full organization access because org_admin is present.
update public.workspace_memberships membership
set permissions=public.organization_permissions_for_roles(membership.roles),updated_at=now()
from public.business_workspaces workspace
where workspace.id=membership.workspace_id
  and workspace.workspace_type='organization'
  and membership.status='active';

-- The legacy policy used is_org_director(), which also includes program
-- directors and exposes the complete subscription row. Limit direct row
-- access to active administrators; mobile clients should use the narrower
-- projection below.
drop policy if exists platform_subscriptions_org_self_read on public.platform_subscriptions;
create policy platform_subscriptions_org_self_read
on public.platform_subscriptions
for select to authenticated
using (
  organization_id is not null
  and exists (
    select 1
    from public.business_workspaces workspace
    join public.workspace_memberships membership
      on membership.workspace_id=workspace.id
    where workspace.organization_id=platform_subscriptions.organization_id
      and workspace.workspace_type='organization'
      and workspace.status='active'
      and membership.user_id=auth.uid()
      and membership.status='active'
      and membership.roles && array['owner','org_admin','admin']::text[]
  )
);

create or replace function public.mobile_workspace_subscription_status(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_subscription public.platform_subscriptions%rowtype;
  v_active_coaches integer;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id=p_workspace_id
      and membership.user_id=auth.uid()
      and membership.status='active'
      and (
        membership.roles && array['owner','org_admin','admin','league_owner','league_admin']::text[]
        or coalesce((membership.permissions->>'view_revenue')::boolean,false)
      )
  ) then
    raise exception 'workspace_billing_access_required' using errcode='42501';
  end if;

  select subscription.* into v_subscription
  from public.platform_subscriptions subscription
  where subscription.workspace_id=p_workspace_id
  order by
    case when subscription.status in ('active','trialing','complimentary','past_due') then 0 else 1 end,
    subscription.updated_at desc
  limit 1;
  if not found then return null; end if;

  select count(*)::integer into v_active_coaches
  from public.workspace_memberships membership
  where membership.workspace_id=p_workspace_id
    and membership.status='active'
    and membership.roles && array['coach','assistant_coach']::text[];

  return jsonb_strip_nulls(jsonb_build_object(
    'has_access', v_subscription.status in ('active','trialing','complimentary'),
    'status', v_subscription.status,
    'billing_role', v_subscription.billing_role,
    'plan_key', v_subscription.plan_key,
    'billing_interval', v_subscription.billing_interval,
    'current_period_end', v_subscription.current_period_end,
    'complimentary_ends_at', v_subscription.complimentary_ends_at,
    'billing_starts_at', v_subscription.billing_starts_at,
    'cancel_at_period_end', v_subscription.cancel_at_period_end,
    'currency', v_subscription.currency,
    'base_amount', v_subscription.renewal_amount_cents,
    'renewal_amount', v_subscription.renewal_amount_cents,
    'active_coach_count', v_active_coaches,
    'purchase_channel', v_subscription.purchase_channel
  ));
end;
$$;

revoke all on function public.mobile_workspace_subscription_status(uuid) from public,anon;
grant execute on function public.mobile_workspace_subscription_status(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
