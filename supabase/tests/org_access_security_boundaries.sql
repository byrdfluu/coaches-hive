begin;

do $$
declare
  admin_id uuid:=gen_random_uuid();
  director_id uuid:=gen_random_uuid();
  staff_id uuid:=gen_random_uuid();
  v_org_id uuid:=gen_random_uuid();
  v_workspace_id uuid:=gen_random_uuid();
  v_admin_membership uuid;
  v_director_membership uuid;
  v_staff_membership uuid;
  v_invite_id uuid:=gen_random_uuid();
  v_failed_invite_id uuid:=gen_random_uuid();
  v_awaiting_invite_id uuid:=gen_random_uuid();
  v_result jsonb;
  v_denied boolean;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values
    (admin_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',admin_id||'@example.invalid','',now(),jsonb_build_object('role','org_admin'),now(),now()),
    (director_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',director_id||'@example.invalid','',now(),jsonb_build_object('role','program_director'),now(),now()),
    (staff_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',staff_id||'@example.invalid','',now(),jsonb_build_object('role','coach'),now(),now());
  insert into public.profiles(id,role,status,email) values
    (admin_id,'org_admin','active',admin_id||'@example.invalid'),
    (director_id,'program_director','active',director_id||'@example.invalid'),
    (staff_id,'coach','active',upper(staff_id||'@example.invalid'))
  on conflict(id) do update set status='active',updated_at=now();
  insert into public.organizations(id) values(v_org_id);
  insert into public.business_workspaces(id,workspace_type,organization_id,display_name,status)
    values(v_workspace_id,'organization',v_org_id,'Security boundary test','active');
  insert into public.organization_memberships(user_id,org_id,role,status) values
    (admin_id,v_org_id,'org_admin','active'),
    (director_id,v_org_id,'program_director','active'),
    (staff_id,v_org_id,'coach','active');
  select id into v_admin_membership from public.organization_memberships where org_id=v_org_id and user_id=admin_id;
  select id into v_director_membership from public.organization_memberships where org_id=v_org_id and user_id=director_id;
  select id into v_staff_membership from public.organization_memberships where org_id=v_org_id and user_id=staff_id;
  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status) values
    (v_workspace_id,admin_id,array['org_admin','program_director'],public.organization_permissions_for_roles(array['org_admin','program_director']),'active'),
    (v_workspace_id,director_id,array['program_director'],public.organization_permissions_for_roles(array['program_director']),'active'),
    (v_workspace_id,staff_id,array['coach'],public.organization_permissions_for_roles(array['coach']),'active');
  insert into public.org_invites(id,org_id,role,requested_workspace_roles,invited_email,status,accepted_by,accepted_at)
    values(v_invite_id,v_org_id,'coach',array['coach'],staff_id||'@example.invalid','accepted',staff_id,now());
  insert into public.org_invites(id,org_id,role,requested_workspace_roles,invited_email,invited_user_id,status)
    values
      (v_failed_invite_id,v_org_id,'coach',array['coach'],'different@example.invalid',staff_id,'failed'),
      (v_awaiting_invite_id,v_org_id,'coach',array['coach'],staff_id||'@example.invalid',null,'awaiting_approval');
  insert into public.platform_subscriptions(
    user_id,organization_id,workspace_id,status,owner_type,owner_id,plan_key,billing_interval,
    currency,renewal_amount_cents,current_period_end,purchase_channel,stripe_subscription_id
  ) values(
    admin_id,v_org_id,v_workspace_id,'active','org',v_org_id,'organization','month',
    'usd',24900,now()+interval '1 month','stripe','sub_security_test'
  );

  -- A lower role cannot elevate itself or modify an administrator.
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',director_id::text,true);
  v_denied:=false;
  begin
    perform public.update_my_org_member_access(v_org_id,v_director_membership,'org_admin',false);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Program director promoted itself'; end if;

  v_denied:=false;
  begin
    perform public.update_my_org_member_access(v_org_id,v_admin_membership,'coach',false);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Program director modified an administrator'; end if;

  -- Program directors retain legitimate lower-level staff management.
  perform public.update_my_org_member_access(v_org_id,v_staff_membership,'team_manager',false);
  if not exists(
    select 1 from public.workspace_memberships
    where workspace_id=v_workspace_id and user_id=staff_id
      and roles=array['team_manager']::text[] and status='active'
  ) then raise exception 'Program director could not manage lower-level staff'; end if;

  -- Restore the accepted coach invite state, then remove the user as admin.
  update public.organization_memberships set role='coach' where id=v_staff_membership;
  update public.workspace_memberships
    set roles=array['coach'],permissions=public.organization_permissions_for_roles(array['coach'])
    where workspace_id=v_workspace_id and user_id=staff_id;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.update_my_org_member_access(v_org_id,v_staff_membership,null,true);
  if exists(
    select 1 from public.org_invites
    where id in(v_invite_id,v_failed_invite_id,v_awaiting_invite_id)
      and status<>'canceled'
  ) then
    raise exception 'Staff removal did not revoke every matching invite identity';
  end if;

  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  if exists(select 1 from public.available_workspaces() where workspace_id=v_workspace_id) then
    raise exception 'Removed staff remained in authoritative workspace discovery';
  end if;

  v_denied:=false;
  begin
    perform public.accept_org_invite(v_invite_id,null);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Removed staff replayed an accepted invite'; end if;

  -- Program director alone cannot read billing, while a dual-role org admin
  -- keeps full billing access. Raw Stripe identifiers never leave this RPC.
  perform set_config('request.jwt.claim.sub',director_id::text,true);
  v_denied:=false;
  begin
    perform public.mobile_workspace_subscription_status(v_workspace_id);
  exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'Program director received billing data'; end if;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  v_result:=public.mobile_workspace_subscription_status(v_workspace_id);
  if v_result->>'status'<>'active' or v_result ? 'stripe_subscription_id' then
    raise exception 'Org admin billing access or Stripe identifier projection is incorrect: %',v_result;
  end if;
end $$;

rollback;
