begin;

-- Backend recipient search runs with the service role, so discovery must use
-- the authenticated requester's explicit id instead of auth.uid().
create or replace function public.discover_mobile_public_messaging_staff(p_requester_user_id uuid)
returns table(
  recipient_type text,user_id uuid,full_name text,avatar_url text,
  organization_id uuid,organization_name text,role_label text,
  can_message boolean,message_unavailable_reason text
)
language sql security definer set search_path=public as $$
  with organization_staff as (
    select distinct on (p.id,w.organization_id)
      case when 'program_director'=any(coalesce(m.roles,array[]::text[]))
        then 'program_director' else 'coach' end::text as recipient_type,
      p.id as user_id,p.full_name,p.avatar_url,w.organization_id,o.name as organization_name,
      case when 'program_director'=any(coalesce(m.roles,array[]::text[]))
        then 'Program Director' else 'Coach' end::text as role_label
    from workspace_memberships m
    join business_workspaces w on w.id=m.workspace_id and w.workspace_type='organization'
    join organizations o on o.id=w.organization_id
    join profiles p on p.id=m.user_id
    where m.status='active' and w.status='active' and coalesce(w.is_test,false)=false
      and coalesce(o.status,'active')='active' and coalesce(o.is_test,false)=false
      and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false
      and coalesce(m.roles,array[]::text[]) && array['coach','assistant_coach','program_director']::text[]
      and lower(coalesce(p.coach_privacy_settings->>'visibleToAthletes','true')) not in ('false','0','no')
      and lower(coalesce(p.coach_privacy_settings->>'allowDirectMessages','true')) not in ('false','0','no')
  ), independent_staff as (
    select 'coach'::text as recipient_type,p.id as user_id,p.full_name,p.avatar_url,
      null::uuid as organization_id,null::text as organization_name,'Coach'::text as role_label
    from independent_coach_profiles ic
    join profiles p on p.id=ic.coach_id
    where ic.is_active=true
      and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false
      and lower(coalesce(p.coach_privacy_settings->>'visibleToAthletes','true')) not in ('false','0','no')
      and lower(coalesce(p.coach_privacy_settings->>'allowDirectMessages','true')) not in ('false','0','no')
  ), candidates as (
    select * from organization_staff union all select * from independent_staff
  )
  select c.recipient_type,c.user_id,c.full_name,c.avatar_url,c.organization_id,c.organization_name,c.role_label,
    not exists(select 1 from user_blocks b where
      (b.blocker_id=p_requester_user_id and b.blocked_user_id=c.user_id) or
      (b.blocker_id=c.user_id and b.blocked_user_id=p_requester_user_id)) as can_message,
    case when exists(select 1 from user_blocks b where
      (b.blocker_id=p_requester_user_id and b.blocked_user_id=c.user_id) or
      (b.blocker_id=c.user_id and b.blocked_user_id=p_requester_user_id)) then 'blocked'::text else null::text end
  from candidates c where c.user_id<>p_requester_user_id;
$$;

revoke all on function public.discover_mobile_public_messaging_staff(uuid) from public,anon,authenticated;
grant execute on function public.discover_mobile_public_messaging_staff(uuid) to service_role;

-- Organization-affiliated coaches and directors use the tenant-safe mapped
-- thread path. Only standalone coaches use the independent-coach RPC.
create or replace function public.open_mobile_conversation_with_message(
  p_sender_user_id uuid,p_sender_organization_id uuid,p_recipient_type text,p_recipient_id uuid,
  p_athlete_profile_id uuid,p_resolved_recipient_user_id uuid,p_thread_organization_id uuid,p_title text,
  p_initial_message text,p_idempotency_key uuid
) returns table(thread_id uuid,message_id uuid,reused boolean,message_status text)
language plpgsql security definer set search_path=public as $$
declare v_thread uuid;v_message uuid;v_reused boolean:=false;v_existing mobile_conversation_initial_messages%rowtype;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required';end if;
  if nullif(trim(p_initial_message),'') is null or length(trim(p_initial_message))>5000 then raise exception 'initial_message_invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sender_user_id::text||':'||p_idempotency_key::text,0));
  select * into v_existing from mobile_conversation_initial_messages m where m.sender_user_id=p_sender_user_id and m.idempotency_key=p_idempotency_key;
  if found then return query select v_existing.thread_id,v_existing.message_id,v_existing.thread_reused,'sent'::text;return;end if;

  if p_sender_organization_id is not null then
    if not exists(select 1 from business_workspaces w join workspace_memberships m on m.workspace_id=w.id
      where w.organization_id=p_sender_organization_id and w.workspace_type='organization' and w.status='active'
        and coalesce(w.is_test,false)=false and m.user_id=p_sender_user_id and m.status='active'
        and('owner'=any(m.roles) or 'org_admin'=any(m.roles) or lower(coalesce(m.permissions->>'manage_messages','false')) in('true','1','yes')
          or lower(coalesce(m.permissions->>'send_messages','false')) in('true','1','yes'))) then raise exception 'messaging_permission_denied';end if;
    select r.thread_id,r.reused into v_thread,v_reused from open_mobile_recipient_thread(p_sender_user_id,p_sender_organization_id,p_recipient_type,p_recipient_id,p_athlete_profile_id,p_resolved_recipient_user_id,p_thread_organization_id,p_title) r;
  elsif p_recipient_type='parent_athlete' then
    select r.thread_id,r.reused into v_thread,v_reused from open_public_family_thread(p_sender_user_id,p_resolved_recipient_user_id,p_athlete_profile_id) r;
  elsif p_recipient_type='organization' then
    select r.thread_id,r.reused into v_thread,v_reused from open_family_contact_thread(p_sender_user_id,p_recipient_id,p_athlete_profile_id) r;
  elsif p_recipient_type='coach' and p_thread_organization_id is null then
    select r.thread_id,r.reused into v_thread,v_reused from open_family_coach_thread(p_sender_user_id,p_resolved_recipient_user_id,p_athlete_profile_id) r;
  else
    if not exists(select 1 from profiles p where p.id=p_resolved_recipient_user_id and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false)
      or exists(select 1 from user_blocks b where(b.blocker_id=p_sender_user_id and b.blocked_user_id=p_resolved_recipient_user_id) or(b.blocker_id=p_resolved_recipient_user_id and b.blocked_user_id=p_sender_user_id)) then raise exception 'messaging_unavailable';end if;
    select r.thread_id,r.reused into v_thread,v_reused from open_mobile_recipient_thread(p_sender_user_id,null,p_recipient_type,p_recipient_id,p_athlete_profile_id,p_resolved_recipient_user_id,p_thread_organization_id,p_title) r;
  end if;
  insert into messages(thread_id,sender_id,content,body,workspace_id)
    values(v_thread,p_sender_user_id,trim(p_initial_message),trim(p_initial_message),(select w.id from business_workspaces w where w.organization_id=coalesce(p_sender_organization_id,p_thread_organization_id) and w.workspace_type='organization' and w.status='active' limit 1)) returning id into v_message;
  insert into mobile_conversation_initial_messages(sender_user_id,idempotency_key,thread_id,message_id,thread_reused) values(p_sender_user_id,p_idempotency_key,v_thread,v_message,v_reused);
  return query select v_thread,v_message,v_reused,'sent'::text;
end $$;

revoke all on function public.open_mobile_conversation_with_message(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.open_mobile_conversation_with_message(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

notify pgrst,'reload schema';
commit;
