-- Family-first roster onboarding. Staff create the athlete record and invite a
-- guardian to manage it; direct athlete login remains an optional later step.

alter table public.athlete_profiles alter column owner_user_id drop not null;

create table if not exists public.athlete_guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  invited_email text not null,
  invited_role text not null default 'guardian'
    check (invited_role in ('parent','guardian','athlete')),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','revoked','expired')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists athlete_guardian_invites_pending_uidx
  on public.athlete_guardian_invitations(athlete_id,lower(invited_email),invited_role)
  where status='pending';
create index if not exists athlete_guardian_invites_email_idx
  on public.athlete_guardian_invitations(lower(invited_email),status,created_at desc);

alter table public.athlete_guardian_invitations enable row level security;
drop policy if exists athlete_guardian_invites_read on public.athlete_guardian_invitations;
create policy athlete_guardian_invites_read on public.athlete_guardian_invitations
for select to authenticated using (
  public.is_org_director(org_id)
  or lower(invited_email)=public.current_user_email()
  or exists(select 1 from public.family_members fm
    where fm.family_id=athlete_guardian_invitations.family_id
      and fm.user_id=auth.uid() and fm.status='active')
);

create or replace function public.create_org_athlete_and_invite_guardian(
  p_org_id uuid,
  p_athlete_name text,
  p_guardian_email text,
  p_guardian_role text default 'guardian',
  p_team_id uuid default null,
  p_sport text default null,
  p_grade_level text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_email text:=lower(trim(p_guardian_email));
  v_name text:=trim(p_athlete_name);
  v_family uuid;
  v_athlete uuid;
  v_invite uuid;
  v_recipient uuid;
begin
  if not public.is_org_director(p_org_id) then
    raise exception 'Organization administrator access required';
  end if;
  if v_name='' then raise exception 'Athlete name is required'; end if;
  if v_email='' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid parent or guardian email is required';
  end if;
  if p_guardian_role not in ('parent','guardian') then
    raise exception 'The primary invitation must be for a parent or guardian';
  end if;
  if p_team_id is not null and not exists(
    select 1 from public.org_teams where id=p_team_id and org_id=p_org_id
  ) then raise exception 'Team does not belong to this organization'; end if;

  insert into public.families(status) values('active') returning id into v_family;
  insert into public.athlete_profiles(
    owner_user_id,family_id,full_name,sport,grade_level,is_primary,status
  ) values(null,v_family,v_name,nullif(trim(p_sport),''),nullif(trim(p_grade_level),''),false,'active')
  returning id into v_athlete;
  insert into public.athlete_organization_memberships(athlete_id,org_id,status)
  values(v_athlete,p_org_id,'active');
  if p_team_id is not null then
    insert into public.org_team_members(team_id,athlete_id)
    values(p_team_id,v_athlete) on conflict(team_id,athlete_id) do nothing;
  end if;
  insert into public.athlete_guardian_invitations(
    org_id,team_id,athlete_id,family_id,invited_email,invited_role,created_by
  ) values(p_org_id,p_team_id,v_athlete,v_family,v_email,p_guardian_role,auth.uid())
  returning id into v_invite;

  select id into v_recipient from public.profiles where lower(email)=v_email limit 1;
  if v_recipient is not null then
    perform public.notify_user(v_recipient,'Manage '||v_name,
      'You were invited to manage this athlete in Coaches Hive.','invite',v_invite);
  end if;
  return v_athlete;
end;
$$;

create or replace function public.accept_athlete_guardian_invitation(p_invite_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  r public.athlete_guardian_invitations%rowtype;
  v_workspace uuid;
begin
  select * into r from public.athlete_guardian_invitations
  where id=p_invite_id and status='pending'
    and lower(invited_email)=public.current_user_email() for update;
  if not found then raise exception 'Invitation not found or unavailable'; end if;

  if r.invited_role in ('parent','guardian') then
    insert into public.family_members(family_id,user_id,role,status)
    values(r.family_id,auth.uid(),r.invited_role,'active')
    on conflict(family_id,user_id) do update set role=excluded.role,status='active';
    update public.families set primary_contact_id=coalesce(primary_contact_id,auth.uid()),updated_at=now()
    where id=r.family_id;
  else
    update public.athlete_profiles set owner_user_id=auth.uid(),updated_at=now()
    where id=r.athlete_id and owner_user_id is null;
  end if;

  insert into public.organization_memberships(user_id,org_id,role,status)
  values(auth.uid(),r.org_id,'athlete','active')
  on conflict(user_id,org_id,role) do update set status='active',updated_at=now();
  select id into v_workspace from public.business_workspaces
  where organization_id=r.org_id and workspace_type='organization' limit 1;
  if v_workspace is not null then
    insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
    values(v_workspace,auth.uid(),array['athlete']::text[],'{}'::jsonb,'active',now())
    on conflict(workspace_id,user_id) do update
      set roles=array(select distinct unnest(workspace_memberships.roles||array['athlete']::text[])),
          status='active',updated_at=now();
  end if;
  update public.athlete_guardian_invitations set status='accepted',accepted_by=auth.uid(),
    accepted_at=now(),updated_at=now() where id=r.id;
  return r.athlete_id;
end;
$$;

create or replace function public.invite_athlete_login(p_athlete_id uuid,p_email text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_family uuid;v_org uuid;v_invite uuid;v_email text:=lower(trim(p_email));
begin
  select family_id into v_family from public.athlete_profiles where id=p_athlete_id;
  if v_family is null or not exists(select 1 from public.family_members
    where family_id=v_family and user_id=auth.uid() and status='active') then
    raise exception 'Active parent or guardian access required';
  end if;
  select org_id into v_org from public.athlete_organization_memberships
    where athlete_id=p_athlete_id and status='active' order by created_at limit 1;
  if v_org is null then raise exception 'Athlete is not connected to an organization'; end if;
  insert into public.athlete_guardian_invitations(
    org_id,athlete_id,family_id,invited_email,invited_role,created_by
  ) values(v_org,p_athlete_id,v_family,v_email,'athlete',auth.uid()) returning id into v_invite;
  return v_invite;
end;
$$;

create or replace function public.decline_athlete_guardian_invitation(p_invite_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.athlete_guardian_invitations
    set status='declined',accepted_by=auth.uid(),accepted_at=now(),updated_at=now()
  where id=p_invite_id and status='pending'
    and lower(invited_email)=public.current_user_email();
  if not found then raise exception 'Invitation not found or unavailable'; end if;
end;
$$;

revoke all on function public.create_org_athlete_and_invite_guardian(uuid,text,text,text,uuid,text,text),
  public.accept_athlete_guardian_invitation(uuid),public.invite_athlete_login(uuid,text),
  public.decline_athlete_guardian_invitation(uuid) from public,anon;
grant execute on function public.create_org_athlete_and_invite_guardian(uuid,text,text,text,uuid,text,text),
  public.accept_athlete_guardian_invitation(uuid),public.invite_athlete_login(uuid,text),
  public.decline_athlete_guardian_invitation(uuid) to authenticated;
grant select on public.athlete_guardian_invitations to authenticated;
