begin;

alter table public.threads add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists organization_display_name text,add column if not exists organization_profile_image_url text;
alter table public.messages add column if not exists delivery_status text not null default 'sent',
  add column if not exists delivered_at timestamptz,add column if not exists edited_at timestamptz,add column if not exists deleted_at timestamptz;

create table if not exists public.mobile_message_send_attempts(
  actor_user_id uuid not null references public.profiles(id)on delete restrict,idempotency_key uuid not null,
  thread_id uuid not null references public.threads(id)on delete restrict,message_id uuid not null unique references public.messages(id)on delete restrict,
  created_at timestamptz not null default now(),primary key(actor_user_id,idempotency_key));
create table if not exists public.mobile_message_receipts(
  message_id uuid not null references public.messages(id)on delete cascade,user_id uuid not null references public.profiles(id)on delete cascade,
  delivered_at timestamptz,read_at timestamptz,primary key(message_id,user_id));
create table if not exists public.mobile_thread_presence(
  thread_id uuid not null references public.threads(id)on delete cascade,user_id uuid not null references public.profiles(id)on delete cascade,
  is_typing boolean not null default false,last_seen_at timestamptz not null default now(),expires_at timestamptz not null,primary key(thread_id,user_id));
alter table public.mobile_message_send_attempts enable row level security;alter table public.mobile_message_receipts enable row level security;alter table public.mobile_thread_presence enable row level security;
revoke all on public.mobile_message_send_attempts,public.mobile_message_receipts,public.mobile_thread_presence from public,anon,authenticated;
grant all on public.mobile_message_send_attempts,public.mobile_message_receipts,public.mobile_thread_presence to service_role;

-- Athlete-name search must test owner_user_id and auth_user_id independently.
-- Using coalesce preferred a minor auth account and could discard the adult owner.
create or replace function public.search_mobile_public_family_accounts(p_requester_user_id uuid,p_query text,p_limit integer default 20)
returns table(recipient_user_id uuid,display_name text,subtitle text,avatar_url text,athlete_profile_id uuid,can_message boolean,message_unavailable_reason text)
language plpgsql security definer set search_path=public as $$
declare v_query text:=trim(coalesce(p_query,''));v_target uuid;v_sender jsonb:='{}';v_sender_direct boolean:=true;
begin
 if p_requester_user_id is null or v_query=''then return;end if;
 if lower(v_query)like'id:%'then begin v_target:=substring(v_query from 4)::uuid;exception when invalid_text_representation then return;end;
 else v_query:=trim(regexp_replace(v_query,'[%_]','','g'));if v_query=''then return;end if;end if;
 select case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end into v_sender
 from profiles p where p.id=p_requester_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false;if not found then return;end if;
 v_sender_direct:=lower(coalesce(v_sender->>'allowDirectMessages','true'))in('true','1','yes');
 return query with matched as(select ap.id,ap.owner_user_id,ap.auth_user_id,ap.birthdate from athlete_profiles ap where ap.status='active'and coalesce(ap.is_test,false)=false and v_target is null and ap.full_name ilike'%'||v_query||'%'limit 80),
 candidates as(select p.id,null::uuid athlete_id from profiles p where(v_target is not null and p.id=v_target)or(v_target is null and p.full_name ilike'%'||v_query||'%')
   union select a.owner_user_id,a.id from matched a where a.owner_user_id is not null
   union select a.auth_user_id,a.id from matched a where a.auth_user_id is not null
   union select f.subscription_owner_id,a.id from matched a join family_subscription_athletes f on f.athlete_profile_id=a.id),
 adults as(select distinct on(p.id)p.id,p.full_name,p.avatar_url,lower(coalesce(p.role,''))role,case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end privacy,c.athlete_id
   from candidates c join profiles p on p.id=c.id where p.id<>p_requester_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false
   and lower(coalesce(p.role,''))in('athlete','parent','guardian','family')and(lower(coalesce(p.role,''))<>'athlete'or exists(select 1 from athlete_profiles x where(x.owner_user_id=p.id or x.auth_user_id=p.id)and x.status='active'and coalesce(x.is_test,false)=false and x.birthdate is not null and x.birthdate<=current_date-interval'18 years'))order by p.id,c.athlete_id nulls last),
 assessed as(select a.*,lower(coalesce(a.privacy->>'allowDirectMessages','true'))in('true','1','yes')direct_ok,exists(select 1 from user_blocks b where(b.blocker_id=p_requester_user_id and b.blocked_user_id=a.id)or(b.blocker_id=a.id and b.blocked_user_id=p_requester_user_id))blocked from adults a)
 select a.id,coalesce(nullif(trim(a.full_name),''),'Parent/Athlete')::text,case when a.role='athlete'then'Adult athlete'else'Parent/Guardian'end::text,a.avatar_url,
   case when m.birthdate is not null and m.birthdate<=current_date-interval'18 years'then a.athlete_id else null end,v_sender_direct and a.direct_ok and not a.blocked,
   case when not v_sender_direct then'requester_direct_messages_disabled'when not a.direct_ok then'direct_messages_disabled'when a.blocked then'blocked'else null::text end
 from assessed a left join matched m on m.id=a.athlete_id order by lower(coalesce(a.full_name,'')),a.id limit least(greatest(coalesce(p_limit,20),1),60);
end $$;

create or replace function public.reconcile_mobile_thread_organization(p_thread_id uuid,p_org_id uuid)returns void language plpgsql security definer set search_path=public as $$
begin update threads t set org_id=p_org_id,organization_id=p_org_id,organization_display_name=o.name,organization_profile_image_url=s.profile_image_url
 from organizations o left join org_settings s on s.org_id=o.id where t.id=p_thread_id and o.id=p_org_id;end $$;

create or replace function public.mobile_thread_messages_page(p_actor_user_id uuid,p_thread_id uuid,p_limit integer,p_before_created_at timestamptz default null,p_before_id uuid default null)
returns table(id uuid,thread_id uuid,sender_id uuid,content text,attachment_type text,attachment_storage_path text,attachment_file_name text,attachment_content_type text,attachment_size_bytes bigint,created_at timestamptz,edited_at timestamptz,delivery_status text,delivered_at timestamptz,read_at timestamptz)
language sql security definer set search_path=public as $$
 select m.id,m.thread_id,m.sender_id,coalesce(nullif(m.content,''),m.body),m.attachment_type,m.attachment_storage_path,m.attachment_file_name,m.attachment_content_type,m.attachment_size_bytes,m.created_at,m.edited_at,m.delivery_status,m.delivered_at,r.read_at
 from messages m left join mobile_message_receipts r on r.message_id=m.id and r.user_id=p_actor_user_id
 where m.thread_id=p_thread_id and m.deleted_at is null and exists(select 1 from thread_participants tp where tp.thread_id=p_thread_id and tp.user_id=p_actor_user_id)
 and(p_before_created_at is null or m.created_at<p_before_created_at or(m.created_at=p_before_created_at and m.id<p_before_id))
 order by m.created_at desc,m.id desc limit least(greatest(coalesce(p_limit,51),1),101)
$$;

create or replace function public.send_mobile_thread_message(p_actor_user_id uuid,p_thread_id uuid,p_content text,p_attachment jsonb,p_idempotency_key uuid)
returns table(message_id uuid,delivery_status text,created_at timestamptz,reused boolean)language plpgsql security definer set search_path=public as $$
declare v_existing mobile_message_send_attempts%rowtype;v_message messages%rowtype;v_workspace uuid;
begin
 if p_idempotency_key is null then raise exception'idempotency_key_required';end if;perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':'||p_idempotency_key::text,0));
 select*into v_existing from mobile_message_send_attempts a where a.actor_user_id=p_actor_user_id and a.idempotency_key=p_idempotency_key;
 if found then select*into v_message from messages where id=v_existing.message_id;return query select v_message.id,v_message.delivery_status,v_message.created_at,true;return;end if;
 if not exists(select 1 from thread_participants tp where tp.thread_id=p_thread_id and tp.user_id=p_actor_user_id)then raise exception'messaging_permission_denied';end if;
 if exists(select 1 from thread_participants me join thread_participants other on other.thread_id=me.thread_id and other.user_id<>me.user_id join user_blocks b on(b.blocker_id=me.user_id and b.blocked_user_id=other.user_id)or(b.blocker_id=other.user_id and b.blocked_user_id=me.user_id)where me.thread_id=p_thread_id and me.user_id=p_actor_user_id)then raise exception'messaging_blocked';end if;
 select w.id into v_workspace from threads t join business_workspaces w on w.organization_id=coalesce(t.organization_id,t.org_id)and w.workspace_type='organization'and w.status='active'where t.id=p_thread_id limit 1;
 insert into messages(thread_id,sender_id,content,body,workspace_id,attachment_type,attachment_storage_path,attachment_file_name,attachment_content_type,attachment_size_bytes,delivery_status,delivered_at)
 values(p_thread_id,p_actor_user_id,coalesce(p_content,''),nullif(p_content,''),v_workspace,nullif(p_attachment->>'type',''),nullif(p_attachment->>'storage_path',''),nullif(p_attachment->>'file_name',''),nullif(p_attachment->>'content_type',''),nullif(p_attachment->>'size_bytes','')::bigint,'sent',now())returning*into v_message;
 insert into mobile_message_send_attempts(actor_user_id,idempotency_key,thread_id,message_id)values(p_actor_user_id,p_idempotency_key,p_thread_id,v_message.id);
 insert into mobile_message_receipts(message_id,user_id,delivered_at)select v_message.id,tp.user_id,now()from thread_participants tp where tp.thread_id=p_thread_id and tp.user_id<>p_actor_user_id on conflict do nothing;
 update threads set updated_at=now()where id=p_thread_id;return query select v_message.id,v_message.delivery_status,v_message.created_at,false;
end $$;

create or replace function public.mark_mobile_thread_read(p_actor_user_id uuid,p_thread_id uuid,p_through_message_id uuid default null)returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_now timestamptz:=now();v_through timestamptz;
begin if not exists(select 1 from thread_participants where thread_id=p_thread_id and user_id=p_actor_user_id)then raise exception'messaging_permission_denied';end if;
 select created_at into v_through from messages where id=p_through_message_id and thread_id=p_thread_id;if p_through_message_id is not null and v_through is null then raise exception'message_unavailable';end if;
 insert into mobile_message_receipts(message_id,user_id,delivered_at,read_at)select m.id,p_actor_user_id,coalesce(m.delivered_at,v_now),v_now from messages m where m.thread_id=p_thread_id and m.sender_id is distinct from p_actor_user_id and(p_through_message_id is null or m.created_at<=v_through)on conflict(message_id,user_id)do update set delivered_at=coalesce(mobile_message_receipts.delivered_at,excluded.delivered_at),read_at=excluded.read_at;
 return v_now;end $$;

update threads t set organization_id=coalesce(t.organization_id,t.org_id,m.sender_organization_id),org_id=coalesce(t.org_id,t.organization_id,m.sender_organization_id)
from mobile_recipient_threads m where m.thread_id=t.id and m.sender_organization_id is not null;
update threads t set organization_display_name=o.name,organization_profile_image_url=s.profile_image_url from organizations o left join org_settings s on s.org_id=o.id where o.id=coalesce(t.organization_id,t.org_id);

revoke all on function public.search_mobile_public_family_accounts(uuid,text,integer),public.reconcile_mobile_thread_organization(uuid,uuid),public.mobile_thread_messages_page(uuid,uuid,integer,timestamptz,uuid),public.send_mobile_thread_message(uuid,uuid,text,jsonb,uuid),public.mark_mobile_thread_read(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.search_mobile_public_family_accounts(uuid,text,integer),public.reconcile_mobile_thread_organization(uuid,uuid),public.mobile_thread_messages_page(uuid,uuid,integer,timestamptz,uuid),public.send_mobile_thread_message(uuid,uuid,text,jsonb,uuid),public.mark_mobile_thread_read(uuid,uuid,uuid)to service_role;
notify pgrst,'reload schema';commit;
