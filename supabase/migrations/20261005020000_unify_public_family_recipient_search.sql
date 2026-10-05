begin;

create or replace function public.search_mobile_public_family_accounts(
  p_requester_user_id uuid,
  p_query text,
  p_limit integer default 20,
  p_require_requester_opt_in boolean default true
) returns table(
  recipient_user_id uuid,display_name text,subtitle text,avatar_url text,
  athlete_profile_id uuid,can_message boolean,message_unavailable_reason text
)
language plpgsql security definer set search_path=public as $$
declare v_query text:=trim(coalesce(p_query,''));v_target uuid;v_sender_privacy jsonb:='{}'::jsonb;
  v_sender_direct boolean:=true;v_sender_parent boolean:=false;
begin
  if p_requester_user_id is null or v_query='' then return;end if;
  if lower(v_query) like 'id:%' then
    begin v_target:=substring(v_query from 4)::uuid;exception when invalid_text_representation then return;end;
  else
    v_query:=trim(regexp_replace(v_query,'[%_]','','g'));if v_query='' then return;end if;
  end if;
  select case when jsonb_typeof(p.athlete_privacy_settings)='object' then p.athlete_privacy_settings else '{}'::jsonb end
    into v_sender_privacy from profiles p where p.id=p_requester_user_id
      and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false;
  if not found then return;end if;
  v_sender_direct:=lower(coalesce(v_sender_privacy->>'allowDirectMessages','true')) in('true','1','yes');
  v_sender_parent:=lower(coalesce(v_sender_privacy->>'allowParentToParentMessaging','false')) in('true','1','yes');

  return query
  with matched_athletes as(
    select ap.id,ap.owner_user_id,ap.auth_user_id,ap.birthdate
    from athlete_profiles ap
    where ap.status='active' and coalesce(ap.is_test,false)=false and v_target is null
      and ap.full_name ilike '%'||v_query||'%' limit 80
  ), candidate_accounts as(
    select p.id,null::uuid matched_athlete_id from profiles p
      where(v_target is not null and p.id=v_target) or(v_target is null and p.full_name ilike '%'||v_query||'%')
    union select coalesce(a.auth_user_id,a.owner_user_id),a.id from matched_athletes a
      where coalesce(a.auth_user_id,a.owner_user_id) is not null
    union select f.subscription_owner_id,a.id from matched_athletes a
      join family_subscription_athletes f on f.athlete_profile_id=a.id
  ), adults as(
    select distinct on(p.id) p.id,p.full_name,p.avatar_url,lower(coalesce(p.role,'')) role,
      case when jsonb_typeof(p.athlete_privacy_settings)='object' then p.athlete_privacy_settings else '{}'::jsonb end privacy,
      c.matched_athlete_id
    from candidate_accounts c join profiles p on p.id=c.id
    where p.id<>p_requester_user_id and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false
      and lower(coalesce(p.role,'')) in('athlete','parent','guardian','family')
      and(lower(coalesce(p.role,''))<>'athlete' or exists(select 1 from athlete_profiles adult
        where(adult.owner_user_id=p.id or adult.auth_user_id=p.id) and adult.status='active'
          and coalesce(adult.is_test,false)=false and adult.birthdate is not null
          and adult.birthdate<=current_date-interval '18 years'))
    order by p.id,c.matched_athlete_id nulls last
  ), assessed as(
    select a.*,lower(coalesce(a.privacy->>'allowDirectMessages','true')) in('true','1','yes') recipient_direct,
      lower(coalesce(a.privacy->>'allowParentToParentMessaging','false')) in('true','1','yes') recipient_parent,
      exists(select 1 from user_blocks b where(b.blocker_id=p_requester_user_id and b.blocked_user_id=a.id)
        or(b.blocker_id=a.id and b.blocked_user_id=p_requester_user_id)) blocked
    from adults a
  )
  select a.id,coalesce(nullif(trim(a.full_name),''),'Parent/Athlete')::text,
    case when a.role='athlete' then 'Adult athlete' else 'Parent/Guardian' end::text,a.avatar_url,
    case when ma.birthdate is not null and ma.birthdate<=current_date-interval '18 years' then a.matched_athlete_id else null end,
    (not p_require_requester_opt_in or(v_sender_direct and v_sender_parent)) and a.recipient_direct and a.recipient_parent and not a.blocked,
    case
      when p_require_requester_opt_in and not v_sender_direct then 'requester_direct_messages_disabled'
      when p_require_requester_opt_in and not v_sender_parent then 'requester_parent_messaging_not_enabled'
      when not a.recipient_direct then 'direct_messages_disabled'
      when not a.recipient_parent then 'parent_messaging_not_enabled'
      when a.blocked then 'blocked'
      else null::text end
  from assessed a left join matched_athletes ma on ma.id=a.matched_athlete_id
  order by lower(coalesce(a.full_name,'')),a.id limit least(greatest(coalesce(p_limit,20),1),60);
end $$;

revoke all on function public.search_mobile_public_family_accounts(uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.search_mobile_public_family_accounts(uuid,text,integer,boolean) to service_role;

notify pgrst,'reload schema';
commit;
