begin;

do $$
declare v_user uuid:=gen_random_uuid(); v_workspace uuid:=gen_random_uuid(); v_org uuid:=gen_random_uuid();
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_user||'@example.invalid','',now(),now(),now());
  insert into public.profiles(id,role,full_name,status) values(v_user,'athlete','Push Test','active')
  on conflict(id) do update set role=excluded.role,full_name=excluded.full_name,status=excluded.status;
  insert into public.organizations(id,name) values(v_org,'Push Test');
  insert into public.business_workspaces(id,workspace_type,organization_id,display_name) values(v_workspace,'organization',v_org,'Push Test');
  insert into public.device_tokens(user_id,token,environment,active,last_seen_at)
  values(v_user,'not-a-real-apns-token','sandbox',true,now());
  insert into public.user_push_preferences(user_id,show_message_previews) values(v_user,false);
  perform set_config('test.push_user',v_user::text,true);
  perform set_config('test.push_workspace',v_workspace::text,true);
end $$;

insert into public.notifications(user_id,title,body,type,workspace_id,data,expires_at)
values(current_setting('test.push_user')::uuid,'Private message','Sensitive body','message',
  current_setting('test.push_workspace')::uuid,
  jsonb_build_object('app_destination','/messages','portal','athlete','acting_role','athlete'),now()+interval '1 hour');

-- Production may already have older queued work. Make this transactional
-- fixture the deterministic first claim without changing durable queue state.
update public.push_notification_deliveries
set created_at='-infinity',next_attempt_at=now()
where user_id=current_setting('test.push_user')::uuid;

select set_config('request.jwt.claim.role','service_role',true);
do $$
declare r record;
begin
  select * into r from public.claim_push_notification_deliveries(1);
  if r.notification_id is null or r.workspace_id<>current_setting('test.push_workspace')::uuid then raise exception 'Routing metadata missing'; end if;
  if r.badge_count<>1 then raise exception 'Authoritative badge mismatch: %',r.badge_count; end if;
  if r.show_message_previews then raise exception 'Private preview preference ignored'; end if;
  if r.max_attempts<>6 or r.expires_at is null then raise exception 'Retry/expiry contract missing'; end if;
end $$;

-- Expired work must be terminal before it can leave the database.
insert into public.notifications(user_id,title,type,expires_at)
values(current_setting('test.push_user')::uuid,'Expired','schedule',now()-interval '1 second');
do $$ begin
  if exists(select 1 from public.push_notification_deliveries d join public.notifications n on n.id=d.notification_id where n.title='Expired')
  then raise exception 'Expired notification was enqueued'; end if;
end $$;

-- Exhausted work enters the dead-letter state and is never reclaimed.
update public.push_notification_deliveries set status='retrying',attempt_count=max_attempts,next_attempt_at=now();
select count(*) from public.claim_push_notification_deliveries(10);
do $$ begin
  if not exists(select 1 from public.push_notification_deliveries where status='dead_letter')
  then raise exception 'Exhausted delivery not dead-lettered'; end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated','public.claim_push_notification_deliveries(integer)','execute')
    or has_function_privilege('anon','public.push_delivery_health()','execute')
  then raise exception 'Push service authority leaked'; end if;
end $$;

rollback;
