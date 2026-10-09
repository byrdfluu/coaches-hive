begin;

-- The API resolves athlete ownership/guardian authority before invoking this
-- service-role-only function. Keep account and recipient test filtering below,
-- but do not reject an otherwise authorized family because a legacy secondary
-- athlete row itself carries is_test=true. That mismatch previously surfaced as
-- a generic 503 after recipient discovery had already authorized the request.
create or replace function public.open_public_family_thread(
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_athlete_id uuid
) returns table(thread_id uuid,reused boolean)
language plpgsql security definer set search_path=public as $$
declare v_sender_privacy jsonb;v_recipient_privacy jsonb;v_recipient_role text;v_thread uuid;
begin
 if p_sender_user_id is null or p_recipient_user_id is null or p_sender_user_id=p_recipient_user_id then raise exception'recipient_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender_user_id::text,p_recipient_user_id::text)||':'||greatest(p_sender_user_id::text,p_recipient_user_id::text),0));
 if not exists(select 1 from athlete_profiles ap where ap.id=p_athlete_id and ap.status='active'and(ap.owner_user_id=p_sender_user_id or ap.auth_user_id=p_sender_user_id or exists(select 1 from family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_sender_user_id)or exists(select 1 from guardian_privacy_consents g where g.athlete_id=ap.id and g.guardian_user_id=p_sender_user_id and g.guardian_identity_confirmed=true and g.coppa_consent_given=true)))then raise exception'athlete_profile_unavailable';end if;
 select case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end into v_sender_privacy from profiles p where p.id=p_sender_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false;if not found then raise exception'messaging_unavailable';end if;
 select case when jsonb_typeof(p.athlete_privacy_settings)='object'then p.athlete_privacy_settings else'{}'::jsonb end,lower(coalesce(p.role,''))into v_recipient_privacy,v_recipient_role from profiles p where p.id=p_recipient_user_id and coalesce(p.status,'active')='active'and coalesce(p.is_test,false)=false and lower(coalesce(p.role,''))in('athlete','parent','guardian','family');if not found then raise exception'messaging_unavailable';end if;
 if lower(coalesce(v_sender_privacy->>'allowDirectMessages','true'))not in('true','1','yes')or lower(coalesce(v_recipient_privacy->>'allowDirectMessages','true'))not in('true','1','yes')then raise exception'direct_messages_disabled';end if;
 if v_recipient_role='athlete'and not exists(select 1 from athlete_profiles ap where(ap.owner_user_id=p_recipient_user_id or ap.auth_user_id=p_recipient_user_id)and ap.status='active'and coalesce(ap.is_test,false)=false and((ap.birthdate is not null and ap.birthdate<=current_date-interval'18 years')or(ap.owner_user_id=p_recipient_user_id and ap.auth_user_id is distinct from p_recipient_user_id)))then raise exception'minor_messaging_unavailable';end if;
 if exists(select 1 from user_blocks b where(b.blocker_id=p_sender_user_id and b.blocked_user_id=p_recipient_user_id)or(b.blocker_id=p_recipient_user_id and b.blocked_user_id=p_sender_user_id))then raise exception'messaging_blocked';end if;
 select t.id into v_thread from threads t where coalesce(t.is_group,false)=false and exists(select 1 from thread_participants tp where tp.thread_id=t.id and tp.user_id=p_sender_user_id)and exists(select 1 from thread_participants tp where tp.thread_id=t.id and tp.user_id=p_recipient_user_id)and(select count(distinct tp.user_id)from thread_participants tp where tp.thread_id=t.id)=2 order by t.updated_at desc nulls last limit 1;
 if v_thread is not null then return query select v_thread,true;return;end if;
 insert into threads(title,is_group,created_by)values('Family conversation',false,p_sender_user_id)returning id into v_thread;
 insert into thread_participants(thread_id,user_id,role)values(v_thread,p_sender_user_id,'family'),(v_thread,p_recipient_user_id,'family');
 insert into mobile_recipient_threads(sender_user_id,sender_organization_id,recipient_type,recipient_id,athlete_profile_id,resolved_recipient_user_id,thread_id)values(p_sender_user_id,null,'parent_athlete',p_recipient_user_id,p_athlete_id,p_recipient_user_id,v_thread)on conflict(sender_user_id,sender_organization_id,recipient_type,recipient_id,athlete_profile_id)do nothing;
 return query select v_thread,false;
end $$;

revoke all on function public.open_public_family_thread(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.open_public_family_thread(uuid,uuid,uuid)to service_role;
notify pgrst,'reload schema';
commit;
