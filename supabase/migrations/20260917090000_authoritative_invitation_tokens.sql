-- Invitation identity and organization scope are immutable server authority.
-- Plaintext tokens are never persisted; only SHA-256 hashes are stored.

alter table public.org_invites
  add column if not exists organization_name text,
  add column if not exists invite_token_hash text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists email_delivery_status text,
  add column if not exists email_delivery_attempted_at timestamptz;

create unique index if not exists org_invites_token_hash_uidx
  on public.org_invites(invite_token_hash)
  where invite_token_hash is not null;

alter table public.athlete_guardian_invitations
  add column if not exists organization_name text,
  add column if not exists invite_token_hash text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists email_delivery_status text,
  add column if not exists email_delivery_attempted_at timestamptz;

create unique index if not exists athlete_guardian_invites_token_hash_uidx
  on public.athlete_guardian_invitations(invite_token_hash)
  where invite_token_hash is not null;

create or replace function public.accept_org_invitation_token_server(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
) returns table(invite_id uuid, organization_id uuid, invitation_role text)
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.org_invites%rowtype;
  v_workspace_id uuid;
  v_membership_id uuid;
begin
  select * into r
  from public.org_invites
  where invite_token_hash=p_token_hash
    and status='pending'
    and token_expires_at > now()
  for update;

  if not found then raise exception 'Invitation not found, expired, or already used'; end if;
  if lower(trim(r.invited_email)) <> lower(trim(p_user_email)) then
    raise exception 'Invitation recipient does not match the authenticated user';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id and lower(email)=lower(trim(p_user_email))) then
    raise exception 'Authenticated profile could not be verified';
  end if;

  select id into v_membership_id from public.organization_memberships
  where org_id=r.org_id and user_id=p_user_id
  order by created_at limit 1 for update;

  if v_membership_id is null then
    insert into public.organization_memberships(org_id,user_id,role,status)
    values(r.org_id,p_user_id,r.role,'active');
  else
    update public.organization_memberships
      set role=r.role,status='active',suspended_at=null,updated_at=now()
    where id=v_membership_id;
  end if;

  select id into v_workspace_id from public.business_workspaces
  where organization_id=r.org_id and workspace_type='organization'
  order by created_at limit 1;
  if v_workspace_id is not null then
    insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
    values(v_workspace_id,p_user_id,array[r.role]::text[],'{}'::jsonb,'active',now())
    on conflict(workspace_id,user_id) do update
      set roles=array(select distinct unnest(public.workspace_memberships.roles||array[r.role]::text[])),
          status='active',updated_at=now();
  end if;

  if r.team_id is not null and r.role in ('coach','assistant_coach') then
    insert into public.org_team_coaches(team_id,coach_id,role)
    values(r.team_id,p_user_id,r.role)
    on conflict do nothing;
    if r.role='coach' then
      update public.org_teams set coach_id=coalesce(coach_id,p_user_id),updated_at=now()
      where id=r.team_id and org_id=r.org_id;
    end if;
  end if;

  update public.org_invites
    set status='approved',invited_user_id=p_user_id,accepted_by=p_user_id,
        accepted_at=now(),updated_at=now()
  where id=r.id;

  return query select r.id,r.org_id,r.role;
end;
$$;

revoke all on function public.accept_org_invitation_token_server(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_org_invitation_token_server(text,uuid,text) to service_role;

create or replace function public.accept_guardian_invitation_token_server(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
) returns table(invite_id uuid, organization_id uuid, athlete_id uuid)
language plpgsql security definer set search_path=public as $$
declare r public.athlete_guardian_invitations%rowtype; v_workspace_id uuid;
begin
  select * into r from public.athlete_guardian_invitations
  where invite_token_hash=p_token_hash and status='pending' and token_expires_at>now() for update;
  if not found then raise exception 'Invitation not found, expired, or already used'; end if;
  if lower(trim(r.invited_email))<>lower(trim(p_user_email)) then
    raise exception 'Invitation recipient does not match the authenticated user';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id and lower(email)=lower(trim(p_user_email))) then
    raise exception 'Authenticated profile could not be verified';
  end if;
  insert into public.family_members(family_id,user_id,role,status)
  values(r.family_id,p_user_id,r.invited_role,'active')
  on conflict(family_id,user_id) do update set role=excluded.role,status='active';
  update public.families set primary_contact_id=coalesce(primary_contact_id,p_user_id),updated_at=now()
  where id=r.family_id;
  if not exists(select 1 from public.organization_memberships where org_id=r.org_id and user_id=p_user_id) then
    insert into public.organization_memberships(user_id,org_id,role,status)
    values(p_user_id,r.org_id,'athlete','active');
  end if;
  select id into v_workspace_id from public.business_workspaces
  where organization_id=r.org_id and workspace_type='organization' order by created_at limit 1;
  if v_workspace_id is not null then
    insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
    values(v_workspace_id,p_user_id,array['athlete']::text[],'{}'::jsonb,'active',now())
    on conflict(workspace_id,user_id) do update set status='active',updated_at=now();
  end if;
  update public.athlete_guardian_invitations set status='accepted',accepted_by=p_user_id,
    accepted_at=now(),updated_at=now() where id=r.id;
  return query select r.id,r.org_id,r.athlete_id;
end; $$;

revoke all on function public.accept_guardian_invitation_token_server(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_guardian_invitation_token_server(text,uuid,text) to service_role;
