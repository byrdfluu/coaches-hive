begin;

create or replace function public.search_public_family_recipients(
  p_requester_user_id uuid,
  p_query text,
  p_limit integer default 20
) returns table(
  recipient_user_id uuid,
  display_name text,
  subtitle text,
  avatar_url text,
  athlete_profile_id uuid,
  can_message boolean,
  message_unavailable_reason text
)
language plpgsql security definer set search_path=public as $$
declare
  v_query text:=trim(coalesce(p_query,''));
  v_target uuid;
  v_sender_privacy jsonb;
begin
  if p_requester_user_id is null or v_query='' then return;end if;
  if lower(v_query) like 'id:%' then
    begin v_target:=substring(v_query from 4)::uuid;exception when invalid_text_representation then return;end;
  else
    v_query:=trim(regexp_replace(v_query,'[%_]','','g'));
    if v_query='' then return;end if;
  end if;
  select case when jsonb_typeof(p.athlete_privacy_settings)='object' then p.athlete_privacy_settings else '{}'::jsonb end
    into v_sender_privacy from profiles p where p.id=p_requester_user_id
      and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false;
  if not found
    or lower(coalesce(v_sender_privacy->>'allowDirectMessages','true')) not in('true','1','yes')
    or lower(coalesce(v_sender_privacy->>'allowParentToParentMessaging','false')) not in('true','1','yes') then return;end if;

  return query
  with matched_athletes as(
    select ap.id,ap.owner_user_id,ap.auth_user_id,ap.birthdate
    from athlete_profiles ap
    where ap.status='active' and coalesce(ap.is_test,false)=false
      and v_target is null and ap.full_name ilike '%'||v_query||'%'
    limit 80
  ), candidate_accounts as(
    select p.id,null::uuid matched_athlete_id from profiles p
      where(v_target is not null and p.id=v_target)
        or(v_target is null and p.full_name ilike '%'||v_query||'%')
    union
    select coalesce(a.auth_user_id,a.owner_user_id),a.id from matched_athletes a
      where coalesce(a.auth_user_id,a.owner_user_id) is not null
    union
    select f.subscription_owner_id,a.id from matched_athletes a
      join family_subscription_athletes f on f.athlete_profile_id=a.id
  ), eligible as(
    select distinct on(p.id) p.id,p.full_name,p.avatar_url,lower(coalesce(p.role,'')) role,
      case when jsonb_typeof(p.athlete_privacy_settings)='object' then p.athlete_privacy_settings else '{}'::jsonb end privacy,
      c.matched_athlete_id
    from candidate_accounts c join profiles p on p.id=c.id
    where p.id<>p_requester_user_id and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false
      and lower(coalesce(p.role,'')) in('athlete','parent','guardian','family')
    order by p.id,c.matched_athlete_id nulls last
  )
  select e.id,coalesce(nullif(trim(e.full_name),''),'Parent/Athlete')::text,
    case when e.role='athlete' then 'Athlete' else 'Parent/Guardian' end::text,e.avatar_url,
    case when ma.birthdate is not null and ma.birthdate<=current_date-interval '18 years' then e.matched_athlete_id else null end,
    true,null::text
  from eligible e left join matched_athletes ma on ma.id=e.matched_athlete_id
  where lower(coalesce(e.privacy->>'allowDirectMessages','true')) in('true','1','yes')
    and lower(coalesce(e.privacy->>'allowParentToParentMessaging','false')) in('true','1','yes')
    and(e.role<>'athlete' or exists(select 1 from athlete_profiles adult where
      (adult.owner_user_id=e.id or adult.auth_user_id=e.id) and adult.status='active' and coalesce(adult.is_test,false)=false
      and adult.birthdate is not null and adult.birthdate<=current_date-interval '18 years'))
    and not exists(select 1 from user_blocks b where
      (b.blocker_id=p_requester_user_id and b.blocked_user_id=e.id)
      or(b.blocker_id=e.id and b.blocked_user_id=p_requester_user_id))
  order by lower(coalesce(e.full_name,'')),e.id limit least(greatest(coalesce(p_limit,20),1),60);
end $$;

create table if not exists public.mobile_conversation_initial_messages(
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  thread_id uuid not null references public.threads(id) on delete restrict,
  message_id uuid not null unique references public.messages(id) on delete restrict,
  thread_reused boolean not null default false,
  created_at timestamptz not null default now(),
  unique(sender_user_id,idempotency_key)
);
alter table public.mobile_conversation_initial_messages enable row level security;
revoke all on public.mobile_conversation_initial_messages from public,anon,authenticated;
grant all on public.mobile_conversation_initial_messages to service_role;

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
  select * into v_existing from mobile_conversation_initial_messages m
    where m.sender_user_id=p_sender_user_id and m.idempotency_key=p_idempotency_key;
  if found then return query select v_existing.thread_id,v_existing.message_id,v_existing.thread_reused,'sent'::text;return;end if;

  if p_sender_organization_id is not null then
    if not exists(select 1 from business_workspaces w join workspace_memberships m on m.workspace_id=w.id
      where w.organization_id=p_sender_organization_id and w.workspace_type='organization' and w.status='active'
        and coalesce(w.is_test,false)=false and m.user_id=p_sender_user_id and m.status='active'
        and('owner'=any(m.roles) or 'org_admin'=any(m.roles) or lower(coalesce(m.permissions->>'manage_messages','false')) in('true','1','yes')
          or lower(coalesce(m.permissions->>'send_messages','false')) in('true','1','yes'))) then raise exception 'messaging_permission_denied';end if;
    select r.thread_id,r.reused into v_thread,v_reused from open_mobile_recipient_thread(p_sender_user_id,p_sender_organization_id,
      p_recipient_type,p_recipient_id,p_athlete_profile_id,p_resolved_recipient_user_id,p_thread_organization_id,p_title) r;
  elsif p_recipient_type='parent_athlete' then
    select r.thread_id,r.reused into v_thread,v_reused from open_public_family_thread(p_sender_user_id,p_resolved_recipient_user_id,p_athlete_profile_id) r;
  elsif p_recipient_type='organization' then
    select r.thread_id,r.reused into v_thread,v_reused from open_family_contact_thread(p_sender_user_id,p_recipient_id,p_athlete_profile_id) r;
  elsif p_recipient_type='coach' then
    select r.thread_id,r.reused into v_thread,v_reused from open_family_coach_thread(p_sender_user_id,p_resolved_recipient_user_id,p_athlete_profile_id) r;
  else
    if not exists(select 1 from profiles p where p.id=p_resolved_recipient_user_id and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false)
      or exists(select 1 from user_blocks b where(b.blocker_id=p_sender_user_id and b.blocked_user_id=p_resolved_recipient_user_id)
        or(b.blocker_id=p_resolved_recipient_user_id and b.blocked_user_id=p_sender_user_id)) then raise exception 'messaging_unavailable';end if;
    select r.thread_id,r.reused into v_thread,v_reused from open_mobile_recipient_thread(p_sender_user_id,null,p_recipient_type,
      p_recipient_id,p_athlete_profile_id,p_resolved_recipient_user_id,p_thread_organization_id,p_title) r;
  end if;
  insert into messages(thread_id,sender_id,content,body,workspace_id)
    values(v_thread,p_sender_user_id,trim(p_initial_message),trim(p_initial_message),
      (select w.id from business_workspaces w where w.organization_id=p_sender_organization_id and w.workspace_type='organization' and w.status='active' limit 1))
    returning id into v_message;
  insert into mobile_conversation_initial_messages(sender_user_id,idempotency_key,thread_id,message_id,thread_reused)
    values(p_sender_user_id,p_idempotency_key,v_thread,v_message,v_reused);
  return query select v_thread,v_message,v_reused,'sent'::text;
end $$;

revoke all on function public.search_public_family_recipients(uuid,text,integer),
  public.open_mobile_conversation_with_message(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.search_public_family_recipients(uuid,text,integer),
  public.open_mobile_conversation_with_message(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

notify pgrst,'reload schema';
commit;
