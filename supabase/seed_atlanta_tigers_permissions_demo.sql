-- Atlanta Tigers permissions-page demo data.
-- Safe to rerun. Resolves the Atlanta Tigers organization visible to the
-- byrdjuwan7@gmail.com demo owner. Creates no payments/subscriptions.

do $$
declare
  v_org_id uuid;
  v_owner_id uuid;
  v_jordan_id constant uuid := '20000000-0000-4000-8000-000000000021';
  v_maya_id constant uuid := '20000000-0000-4000-8000-000000000022';
  v_taylor_id constant uuid := '20000000-0000-4000-8000-000000000023';
  v_chris_id constant uuid := '20000000-0000-4000-8000-000000000024';
  v_workspace_id uuid;
begin
  select id into v_owner_id from auth.users where lower(email)='byrdjuwan7@gmail.com' limit 1;
  if v_owner_id is null then raise exception 'byrdjuwan7@gmail.com account is missing.'; end if;

  select o.id into v_org_id
  from public.organizations o
  join public.organization_memberships om on om.org_id=o.id and om.user_id=v_owner_id and coalesce(om.status,'active')='active'
  left join public.org_settings os on os.org_id=o.id
  left join public.business_workspaces bw on bw.organization_id=o.id and bw.workspace_type='organization'
  left join public.active_workspace_preferences awp on awp.user_id=v_owner_id
  where lower(coalesce(os.org_name,o.name,bw.display_name,''))='atlanta tigers'
  order by (bw.id=awp.workspace_id) desc nulls last,om.created_at limit 1;
  if v_org_id is null then
    raise exception 'No Atlanta Tigers membership was found for byrdjuwan7@gmail.com.';
  end if;

  select id into v_workspace_id from public.business_workspaces
  where organization_id=v_org_id and workspace_type='organization' limit 1;
  if v_workspace_id is null then
    raise exception 'Atlanta Tigers organization workspace is missing.';
  end if;

  -- Non-login demo identities. Random passwords are not shared or displayed.
  insert into auth.users (
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,recovery_token,email_change_token_new,
    email_change_token_current,email_change,phone_change,
    phone_change_token,reauthentication_token
  ) values
    ('00000000-0000-0000-0000-000000000000',v_jordan_id,'authenticated','authenticated',
     'jordan.brooks.demo@example.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Jordan Brooks"}'::jsonb,now(),now(),'','','','','','','',''),
    ('00000000-0000-0000-0000-000000000000',v_maya_id,'authenticated','authenticated',
     'maya.thompson.demo@example.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Coach Maya Thompson","role":"coach"}'::jsonb,now(),now(),'','','','','','','',''),
    ('00000000-0000-0000-0000-000000000000',v_taylor_id,'authenticated','authenticated',
     'taylor.morgan.demo@example.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Taylor Morgan","role":"org_admin"}'::jsonb,now(),now(),'','','','','','','',''),
    ('00000000-0000-0000-0000-000000000000',v_chris_id,'authenticated','authenticated',
     'chris.lee.demo@example.invalid',crypt(gen_random_uuid()::text,gen_salt('bf')),now(),
     '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Chris Lee","role":"coach"}'::jsonb,now(),now(),'','','','','','','','')
  on conflict(id) do nothing;

  insert into public.profiles(id,email,full_name,role,status,is_test,created_at,updated_at)
  values
    (v_jordan_id,'jordan.brooks.demo@example.invalid','Jordan Brooks','athlete','active',true,now(),now()),
    (v_maya_id,'maya.thompson.demo@example.invalid','Coach Maya Thompson','coach','active',true,now(),now()),
    (v_taylor_id,'taylor.morgan.demo@example.invalid','Taylor Morgan','org_admin','active',true,now(),now()),
    (v_chris_id,'chris.lee.demo@example.invalid','Chris Lee','coach','active',true,now(),now())
  on conflict(id) do update set
    email=excluded.email,full_name=excluded.full_name,status='active',is_test=true,updated_at=now();

  -- Deployed environments have used more than one membership uniqueness
  -- shape. Replace only these deterministic demo memberships instead of
  -- relying on an ON CONFLICT column list.
  delete from public.organization_memberships
  where org_id=v_org_id
    and user_id in (v_owner_id,v_taylor_id,v_jordan_id,v_maya_id,v_chris_id);

  -- A realistic spread of roles for the permissions page.
  insert into public.organization_memberships(org_id,user_id,role,status,created_at,updated_at)
  values
    (v_org_id,v_owner_id,'org_admin','active',now()-interval '2 years',now()),
    (v_org_id,v_taylor_id,'program_director','active',now()-interval '14 months',now()),
    (v_org_id,v_jordan_id,'team_manager','active',now()-interval '9 months',now()),
    (v_org_id,v_maya_id,'assistant_coach','active',now()-interval '7 months',now()),
    (v_org_id,v_chris_id,'coach','active',now()-interval '2 months',now());

  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,created_at,updated_at)
  values
    (v_workspace_id,v_owner_id,array['owner','org_admin','coach'],
     '{"manage_members":true,"approve_athletes":true,"manage_teams":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true,"manage_connect":true,"send_documents":true,"view_audit":true,"export_records":true}'::jsonb,'active',now()-interval '2 years',now()),
    (v_workspace_id,v_taylor_id,array['org_admin'],
     '{"manage_members":true,"approve_athletes":true,"manage_teams":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true,"send_documents":true,"view_audit":true,"export_records":true}'::jsonb,'active',now()-interval '14 months',now()),
    (v_workspace_id,v_jordan_id,array['team_manager'],
     '{"manage_members":false,"approve_athletes":true,"manage_teams":false,"manage_schedule":true,"send_documents":true,"view_audit":false,"export_records":false}'::jsonb,'active',now()-interval '9 months',now()),
    (v_workspace_id,v_maya_id,array['assistant_coach'],
     '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb,'active',now()-interval '7 months',now()),
    (v_workspace_id,v_chris_id,array['coach'],
     '{"request_athletes":false,"view_assigned_athletes":true,"manage_schedule":false,"send_documents":false}'::jsonb,'active',now()-interval '2 months',now())
  on conflict(workspace_id,user_id) do update set
    roles=excluded.roles,permissions=excluded.permissions,status='active',updated_at=now();
end $$;
