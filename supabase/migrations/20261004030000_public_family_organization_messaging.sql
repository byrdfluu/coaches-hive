begin;

-- Willy Mays's Organization is retained only as test data. All hardened family
-- discovery contracts exclude either flag, including indirect owned records.
update public.organizations set is_test=true
where id in(select org_id from public.org_settings where lower(trim(coalesce(org_name,''))) in
  ('willy may''s organization','willy mays''s organization'));
update public.business_workspaces set is_test=true
where organization_id in(select org_id from public.org_settings where lower(trim(coalesce(org_name,''))) in
  ('willy may''s organization','willy mays''s organization'));

create or replace function public.open_family_contact_thread(
  p_family_user_id uuid,
  p_org_id uuid,
  p_athlete_id uuid
) returns table(thread_id uuid,reused boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_contact uuid;v_label text;v_workspace uuid;v_thread uuid;
  v_contact_privacy jsonb;v_family_privacy jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_family_user_id::text||':'||p_org_id::text||':'||p_athlete_id::text,0));
  select os.primary_family_contact_user_id,
    coalesce(nullif(trim(os.primary_family_contact_label),''),'Family Support'),w.id
    into v_contact,v_label,v_workspace
  from org_settings os
  join organizations o on o.id=os.org_id and coalesce(o.status,'active')='active' and coalesce(o.is_test,false)=false
  join business_workspaces w on w.organization_id=os.org_id and w.workspace_type='organization'
    and w.status='active' and coalesce(w.is_test,false)=false
  where os.org_id=p_org_id;
  if v_contact is null then raise exception 'family_contact_unavailable';end if;
  if not exists(select 1 from athlete_profiles ap where ap.id=p_athlete_id and ap.status='active'
    and coalesce(ap.is_test,false)=false and(ap.owner_user_id=p_family_user_id
      or exists(select 1 from family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_family_user_id)
      or exists(select 1 from guardian_privacy_consents g where g.athlete_id=ap.id and g.guardian_user_id=p_family_user_id
        and g.guardian_identity_confirmed=true and g.coppa_consent_given=true))) then
    raise exception 'athlete_profile_unavailable';end if;
  -- Public messaging does not require roster membership. Saved connections are
  -- neither membership nor a prerequisite and therefore are not consulted.
  if not exists(select 1 from workspace_memberships m where m.workspace_id=v_workspace and m.user_id=v_contact
    and m.status='active' and('owner'=any(m.roles) or 'org_admin'=any(m.roles) or 'program_director'=any(m.roles)
      or coalesce((m.permissions->>'manage_messages')::boolean,false)
      or coalesce((m.permissions->>'messages.manage')::boolean,false)
      or coalesce((m.permissions->>'messaging')::boolean,false))) then
    raise exception 'family_contact_permission_revoked';end if;
  if exists(select 1 from user_blocks b where(b.blocker_id=p_family_user_id and b.blocked_user_id=v_contact)
    or(b.blocker_id=v_contact and b.blocked_user_id=p_family_user_id)) then raise exception 'messaging_blocked';end if;
  select coach_privacy_settings into v_contact_privacy from profiles where id=v_contact
    and coalesce(status,'active')='active' and coalesce(is_test,false)=false;
  if not found then raise exception 'messaging_unavailable';end if;
  select athlete_privacy_settings into v_family_privacy from profiles where id=p_family_user_id
    and coalesce(status,'active')='active' and coalesce(is_test,false)=false;
  if not found then raise exception 'messaging_unavailable';end if;
  if coalesce((v_contact_privacy->>'allowDirectMessages')::boolean,true)=false
    or coalesce((v_family_privacy->>'allowDirectMessages')::boolean,true)=false then raise exception 'messaging_unavailable';end if;
  select f.thread_id into v_thread from family_contact_threads f
  where f.organization_id=p_org_id and f.athlete_profile_id=p_athlete_id
    and f.family_user_id=p_family_user_id and f.contact_user_id=v_contact;
  if v_thread is not null then return query select v_thread,true;return;end if;
  insert into threads(title,is_group,created_by,org_id) values(v_label,false,p_family_user_id,p_org_id) returning id into v_thread;
  insert into thread_participants(thread_id,user_id,role) values
    (v_thread,p_family_user_id,'family'),(v_thread,v_contact,'organization_contact');
  insert into family_contact_threads(organization_id,athlete_profile_id,family_user_id,contact_user_id,thread_id)
    values(p_org_id,p_athlete_id,p_family_user_id,v_contact,v_thread);
  return query select v_thread,false;
end $$;
revoke all on function public.open_family_contact_thread(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.open_family_contact_thread(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
