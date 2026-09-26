-- Authorize durable multi-role organization invitations and preserve every
-- invited workspace role when the recipient accepts the token.

alter table public.org_invites
  add column if not exists roles text[];

update public.org_invites
set roles = array[role]::text[]
where roles is null or cardinality(roles) = 0;

alter table public.org_invites
  alter column roles set default '{}'::text[];

alter table public.workspace_memberships
  drop constraint if exists workspace_memberships_roles_check;
alter table public.workspace_memberships
  add constraint workspace_memberships_roles_check check(roles <@ array[
    'owner','org_admin','club_admin','travel_admin','school_admin',
    'athletic_director','program_director','coach','assistant_coach',
    'team_manager','athlete','league_admin','division_admin','finance_manager',
    'registrar','compliance_manager','read_only_auditor'
  ]::text[]);

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
  v_roles text[];
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

  v_roles := case
    when r.roles is null or cardinality(r.roles)=0 then array[r.role]::text[]
    else array(select distinct unnest(r.roles || array[r.role]::text[]))
  end;

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
    values(v_workspace_id,p_user_id,v_roles,'{}'::jsonb,'active',now())
    on conflict(workspace_id,user_id) do update
      set roles=array(select distinct unnest(public.workspace_memberships.roles || v_roles)),
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
