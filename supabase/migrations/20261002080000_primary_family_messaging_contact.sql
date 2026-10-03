begin;

alter table public.org_settings
  add column if not exists primary_family_contact_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists primary_family_contact_label text;

create table if not exists public.family_contact_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete cascade,
  family_user_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(organization_id,athlete_profile_id,family_user_id,contact_user_id)
);

alter table public.family_contact_threads enable row level security;
drop policy if exists family_contact_threads_participant_read on public.family_contact_threads;
create policy family_contact_threads_participant_read on public.family_contact_threads for select to authenticated
using(family_user_id=auth.uid() or contact_user_id=auth.uid());

create or replace function public.open_family_contact_thread(
  p_family_user_id uuid,
  p_org_id uuid,
  p_athlete_id uuid
) returns table(thread_id uuid,reused boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_contact uuid;
  v_label text;
  v_workspace uuid;
  v_thread uuid;
  v_contact_privacy jsonb;
  v_family_privacy jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_family_user_id::text||':'||p_org_id::text||':'||p_athlete_id::text,0));

  select os.primary_family_contact_user_id,coalesce(nullif(trim(os.primary_family_contact_label),''),'Family Support'),w.id
    into v_contact,v_label,v_workspace
  from org_settings os join business_workspaces w on w.organization_id=os.org_id
    and w.workspace_type='organization' and w.status='active'
  where os.org_id=p_org_id;
  if v_contact is null then raise exception 'family_contact_unavailable'; end if;

  if not exists(select 1 from athlete_profiles ap where ap.id=p_athlete_id and ap.status='active'
    and (ap.owner_user_id=p_family_user_id
      or exists(select 1 from family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_family_user_id)
      or exists(select 1 from guardian_privacy_consents g where g.athlete_id=ap.id and g.guardian_user_id=p_family_user_id
        and g.guardian_identity_confirmed=true and g.coppa_consent_given=true))) then
    raise exception 'athlete_profile_unavailable';
  end if;
  if not exists(select 1 from athlete_organization_memberships m where m.athlete_id=p_athlete_id
    and m.org_id=p_org_id and m.status='active') then raise exception 'organization_relationship_inactive'; end if;
  if not exists(select 1 from workspace_memberships m where m.workspace_id=v_workspace and m.user_id=v_contact
    and m.status='active' and ('owner'=any(m.roles) or 'org_admin'=any(m.roles)
      or coalesce((m.permissions->>'manage_messages')::boolean,false)
      or coalesce((m.permissions->>'messages.manage')::boolean,false)
      or coalesce((m.permissions->>'messaging')::boolean,false))) then
    raise exception 'family_contact_permission_revoked';
  end if;
  if exists(select 1 from user_blocks b where
    (b.blocker_id=p_family_user_id and b.blocked_user_id=v_contact)
    or (b.blocker_id=v_contact and b.blocked_user_id=p_family_user_id)) then raise exception 'messaging_blocked'; end if;

  select coach_privacy_settings into v_contact_privacy from profiles where id=v_contact;
  select athlete_privacy_settings into v_family_privacy from profiles where id=p_family_user_id;
  if coalesce((v_contact_privacy->>'allowDirectMessages')::boolean,true)=false then raise exception 'messaging_unavailable'; end if;
  if coalesce((v_family_privacy->>'allowDirectMessages')::boolean,true)=false then raise exception 'messaging_unavailable'; end if;

  select f.thread_id into v_thread from family_contact_threads f
  where f.organization_id=p_org_id and f.athlete_profile_id=p_athlete_id
    and f.family_user_id=p_family_user_id and f.contact_user_id=v_contact;
  if v_thread is not null then return query select v_thread,true; return; end if;

  insert into threads(title,is_group,created_by,org_id)
    values(v_label,false,p_family_user_id,p_org_id) returning id into v_thread;
  insert into thread_participants(thread_id,user_id,role) values
    (v_thread,p_family_user_id,'family'),(v_thread,v_contact,'organization_contact');
  insert into family_contact_threads(organization_id,athlete_profile_id,family_user_id,contact_user_id,thread_id)
    values(p_org_id,p_athlete_id,p_family_user_id,v_contact,v_thread);
  return query select v_thread,false;
end $$;

revoke all on function public.open_family_contact_thread(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.open_family_contact_thread(uuid,uuid,uuid) to service_role;

do $$
declare v_org uuid; v_contact uuid;
begin
  select id into v_org from public.organizations where lower(trim(coalesce(name,'')))='rudy gay academy' limit 1;
  if v_org is null then raise notice 'Rudy Gay Academy was not found; primary family contact was not configured'; return; end if;
  select p.id into v_contact
  from public.business_workspaces w
  join public.workspace_memberships m on m.workspace_id=w.id and m.status='active'
  join public.profiles p on p.id=m.user_id
  where w.organization_id=v_org and w.workspace_type='organization' and w.status='active'
    and lower(trim(coalesce(p.full_name,''))) like 'evan%'
    and ('owner'=any(m.roles) or 'org_admin'=any(m.roles)
      or coalesce((m.permissions->>'manage_messages')::boolean,false)
      or coalesce((m.permissions->>'messages.manage')::boolean,false)
      or coalesce((m.permissions->>'messaging')::boolean,false))
  order by m.created_at limit 1;
  if v_contact is null then raise notice 'Eligible Evan staff membership was not found; primary family contact was not configured'; return; end if;
  insert into public.org_settings(org_id,org_name,primary_family_contact_user_id,primary_family_contact_label,updated_at)
  values(v_org,'Rudy Gay Academy',v_contact,'Parent Support',now())
  on conflict(org_id) do update set primary_family_contact_user_id=excluded.primary_family_contact_user_id,
    primary_family_contact_label=excluded.primary_family_contact_label,updated_at=now();
end $$;

notify pgrst,'reload schema';
commit;
