-- Preserve every requested workspace role when an authenticated user accepts
-- an organization invitation through the mobile RPC.
alter table public.platform_subscriptions
  add column if not exists trial_start timestamptz;

create or replace function public.accept_org_invite(
  invite_id uuid,
  athlete_profile_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.org_invites%rowtype;
  v_membership_id uuid;
  v_athlete_id uuid;
  v_workspace_id uuid;
  v_roles text[];
  v_permissions jsonb;
begin
  select * into r from public.org_invites
  where id=invite_id and status='pending'
    and lower(invited_email)=public.current_user_email() for update;
  if not found then raise exception 'Invite not found or not available'; end if;

  v_roles := case
    when r.roles is null or cardinality(r.roles)=0 then array[r.role]::text[]
    else array(select distinct role_name from unnest(r.roles || array[r.role]::text[]) role_name)
  end;

  select id into v_membership_id from public.organization_memberships
  where user_id=auth.uid() and org_id=r.org_id order by created_at limit 1 for update;
  if v_membership_id is null then
    insert into public.organization_memberships(user_id,org_id,role,status)
    values(auth.uid(),r.org_id,r.role,'active') returning id into v_membership_id;
  else
    update public.organization_memberships set role=r.role,status='active',updated_at=now()
    where id=v_membership_id;
  end if;

  select id into v_workspace_id from public.business_workspaces
  where organization_id=r.org_id and workspace_type='organization' limit 1;
  if v_workspace_id is not null then
    v_permissions := case
      when v_roles && array['owner','org_admin','program_director']::text[] then
        '{"manage_members":true,"approve_athletes":true,"manage_teams":true,"manage_schedule":true,"manage_pricing":true,"view_revenue":true}'::jsonb
      when v_roles && array['team_manager']::text[] then
        '{"approve_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb
      when v_roles && array['coach','assistant_coach']::text[] then
        '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb
      else '{}'::jsonb end;
    insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
    values(v_workspace_id,auth.uid(),v_roles,v_permissions,'active',now())
    on conflict(workspace_id,user_id) do update
      set roles=array(
            select distinct role_name
            from unnest(public.workspace_memberships.roles || excluded.roles) role_name
          ),
          permissions=public.workspace_memberships.permissions || excluded.permissions,
          status='active',updated_at=now();
  end if;

  if r.role='athlete' then
    select id into v_athlete_id from public.athlete_profiles
    where owner_user_id=auth.uid() and id=coalesce(athlete_profile_id,id)
    order by is_primary desc,created_at limit 1;
    if v_athlete_id is null then raise exception 'Select an athlete profile for this invite'; end if;
    insert into public.athlete_organization_memberships(athlete_id,org_id,status)
    values(v_athlete_id,r.org_id,'active')
    on conflict(athlete_id,org_id) do update set status='active',updated_at=now();
  elsif r.role in ('coach','assistant_coach') and r.team_id is not null then
    insert into public.org_team_coaches(team_id,coach_id)
    values(r.team_id,auth.uid()) on conflict(team_id,coach_id) do nothing;
  end if;

  update public.org_invites set status='accepted',accepted_by=auth.uid(),accepted_at=now(),updated_at=now()
  where id=r.id;
  perform public.notify_user(auth.uid(),'Invite accepted','You joined the organization.','invite',r.id);
  return v_membership_id;
end;
$$;

-- Repair the already-accepted multi-role Rudy Gay Academy invitation.
update public.workspace_memberships wm
set roles = array(
      select distinct role_name
      from unnest(wm.roles || array['org_admin','program_director']::text[]) role_name
    ),
    updated_at = now()
where wm.workspace_id='0de43b8e-fea3-40e6-92bf-32c945ceb830'::uuid
  and wm.user_id='e811758c-d309-4ce4-b35e-5d33edce0a83'::uuid;

-- Rudy Gay Academy has a complimentary six-month Established Organization
-- trial. The upsert is idempotent and does not alter any other organization.
insert into public.platform_subscriptions(
  owner_type,owner_id,user_id,organization_id,workspace_id,tier,plan_type,plan_key,
  status,trial_start,trial_end,current_period_start,current_period_end,
  billing_interval,renewal_amount_cents,currency,purchase_channel
)
select
  'org',o.id,om.user_id,o.id,w.id,'established_organization',
  'established_organization','established_organization','trialing',
  now(),now()+interval '6 months',now(),now()+interval '6 months',
  'month',24900,'usd',null
from public.organizations o
join public.business_workspaces w on w.organization_id=o.id and w.workspace_type='organization'
join lateral (
  select user_id from public.organization_memberships
  where org_id=o.id and status='active' and role='org_admin'
  order by created_at limit 1
) om on true
where o.id='72676163-6164-456d-9961-636164656d79'::uuid
on conflict(owner_type,owner_id) do update set
  workspace_id=excluded.workspace_id,
  organization_id=excluded.organization_id,
  tier='established_organization',
  plan_type='established_organization',
  plan_key='established_organization',
  status='trialing',
  trial_start=coalesce(public.platform_subscriptions.trial_start,excluded.trial_start),
  trial_end=coalesce(public.platform_subscriptions.trial_end,excluded.trial_end),
  current_period_start=coalesce(public.platform_subscriptions.current_period_start,excluded.current_period_start),
  current_period_end=coalesce(public.platform_subscriptions.current_period_end,excluded.current_period_end),
  billing_interval=coalesce(public.platform_subscriptions.billing_interval,excluded.billing_interval),
  renewal_amount_cents=coalesce(public.platform_subscriptions.renewal_amount_cents,excluded.renewal_amount_cents),
  updated_at=now();

update public.org_settings
set plan='established_organization',plan_status='trialing',updated_at=now()
where org_id='72676163-6164-456d-9961-636164656d79'::uuid;
