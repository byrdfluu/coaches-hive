begin;

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
 raw_candidates as(
   select p.id,null::uuid athlete_id,false owner_account from profiles p where(v_target is not null and p.id=v_target)or(v_target is null and p.full_name ilike'%'||v_query||'%')
   union all select a.owner_user_id,a.id,true from matched a where a.owner_user_id is not null
   union all select a.auth_user_id,a.id,false from matched a where a.auth_user_id is not null
   union all select f.subscription_owner_id,a.id,true from matched a join family_subscription_athletes f on f.athlete_profile_id=a.id),
 candidates as(select id,athlete_id,bool_or(owner_account)owner_account from raw_candidates group by id,athlete_id),
 adults as(select distinct on(p.id)p.id,p.full_name,p.avatar_url,lower(coalesce(p.role,''))role,case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end privacy,c.athlete_id,c.owner_account
   from candidates c join profiles p on p.id=c.id where p.id<>p_requester_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false
   and lower(coalesce(p.role,''))in('athlete','parent','guardian','family')
   and(lower(coalesce(p.role,''))<>'athlete'or c.owner_account or exists(select 1 from athlete_profiles x where(x.owner_user_id=p.id or x.auth_user_id=p.id)and x.status='active'and coalesce(x.is_test,false)=false and x.birthdate is not null and x.birthdate<=current_date-interval'18 years'))
   order by p.id,c.owner_account desc,c.athlete_id nulls last),
 assessed as(select a.*,lower(coalesce(a.privacy->>'allowDirectMessages','true'))in('true','1','yes')direct_ok,exists(select 1 from user_blocks b where(b.blocker_id=p_requester_user_id and b.blocked_user_id=a.id)or(b.blocker_id=a.id and b.blocked_user_id=p_requester_user_id))blocked from adults a)
 select a.id,coalesce(nullif(trim(a.full_name),''),'Parent/Athlete')::text,case when a.owner_account then'Parent/Guardian'when a.role='athlete'then'Adult athlete'else'Parent/Guardian'end::text,a.avatar_url,
   case when m.birthdate is not null and m.birthdate<=current_date-interval'18 years'then a.athlete_id else null end,v_sender_direct and a.direct_ok and not a.blocked,
   case when not v_sender_direct then'requester_direct_messages_disabled'when not a.direct_ok then'direct_messages_disabled'when a.blocked then'blocked'else null::text end
 from assessed a left join matched m on m.id=a.athlete_id order by lower(coalesce(a.full_name,'')),a.id limit least(greatest(coalesce(p_limit,20),1),60);
end $$;

create or replace function public.open_public_family_thread(p_sender_user_id uuid,p_recipient_user_id uuid,p_athlete_id uuid)
returns table(thread_id uuid,reused boolean)language plpgsql security definer set search_path=public as $$
declare v_sender_privacy jsonb;v_recipient_privacy jsonb;v_recipient_role text;v_thread uuid;
begin
 if p_sender_user_id is null or p_recipient_user_id is null or p_sender_user_id=p_recipient_user_id then raise exception'recipient_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender_user_id::text,p_recipient_user_id::text)||':'||greatest(p_sender_user_id::text,p_recipient_user_id::text),0));
 if not exists(select 1 from athlete_profiles ap where ap.id=p_athlete_id and ap.status='active'and coalesce(ap.is_test,false)=false and(ap.owner_user_id=p_sender_user_id or ap.auth_user_id=p_sender_user_id or exists(select 1 from family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_sender_user_id)or exists(select 1 from guardian_privacy_consents g where g.athlete_id=ap.id and g.guardian_user_id=p_sender_user_id and g.guardian_identity_confirmed=true and g.coppa_consent_given=true)))then raise exception'athlete_profile_unavailable';end if;
 select case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end into v_sender_privacy from profiles p where p.id=p_sender_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false;if not found then raise exception'messaging_unavailable';end if;
 select case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end,lower(coalesce(p.role,''))into v_recipient_privacy,v_recipient_role from profiles p where p.id=p_recipient_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false and lower(coalesce(p.role,''))in('athlete','parent','guardian','family');if not found then raise exception'messaging_unavailable';end if;
 if lower(coalesce(v_sender_privacy->>'allowDirectMessages','true'))not in('true','1','yes')or lower(coalesce(v_recipient_privacy->>'allowDirectMessages','true'))not in('true','1','yes')then raise exception'direct_messages_disabled';end if;
 if v_recipient_role='athlete'and not exists(select 1 from athlete_profiles ap where(ap.owner_user_id=p_recipient_user_id or ap.auth_user_id=p_recipient_user_id)and ap.status='active'and coalesce(ap.is_test,false)=false and((ap.birthdate is not null and ap.birthdate<=current_date-interval'18 years')or(ap.owner_user_id=p_recipient_user_id and ap.auth_user_id is distinct from p_recipient_user_id)))then raise exception'minor_messaging_unavailable';end if;
 if exists(select 1 from user_blocks b where(b.blocker_id=p_sender_user_id and b.blocked_user_id=p_recipient_user_id)or(b.blocker_id=p_recipient_user_id and b.blocked_user_id=p_sender_user_id))then raise exception'messaging_blocked';end if;
 select t.id into v_thread from threads t where coalesce(t.is_group,false)=false and exists(select 1 from thread_participants tp where tp.thread_id=t.id and tp.user_id=p_sender_user_id)and exists(select 1 from thread_participants tp where tp.thread_id=t.id and tp.user_id=p_recipient_user_id)and(select count(distinct tp.user_id)from thread_participants tp where tp.thread_id=t.id)=2 order by t.updated_at desc nulls last limit 1;
 if v_thread is not null then return query select v_thread,true;return;end if;
 insert into threads(title,is_group,created_by)values('Family conversation',false,p_sender_user_id)returning id into v_thread;insert into thread_participants(thread_id,user_id,role)values(v_thread,p_sender_user_id,'family'),(v_thread,p_recipient_user_id,'family');insert into mobile_recipient_threads(sender_user_id,sender_organization_id,recipient_type,recipient_id,athlete_profile_id,resolved_recipient_user_id,thread_id)values(p_sender_user_id,null,'parent_athlete',p_recipient_user_id,p_athlete_id,p_recipient_user_id,v_thread)on conflict(sender_user_id,sender_organization_id,recipient_type,recipient_id,athlete_profile_id)do nothing;return query select v_thread,false;
end $$;

revoke all on function public.search_mobile_public_family_accounts(uuid,text,integer),public.open_public_family_thread(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.search_mobile_public_family_accounts(uuid,text,integer),public.open_public_family_thread(uuid,uuid,uuid)to service_role;
notify pgrst,'reload schema';commit;
