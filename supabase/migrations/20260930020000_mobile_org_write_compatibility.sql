-- Keep current mobile organization writes tenant-safe while routing future
-- clients through workspace-scoped API endpoints.

-- Repair active organization memberships that predate workspace membership
-- provisioning. Existing roles and permissions are merged, never replaced.
insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status,updated_at)
select w.id,m.user_id,array[m.role]::text[],
  case when m.role in ('owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
    then '{"manage_members":true,"manage_registrations":true,"manage_payments":true,"manage_documents":true,"manage_schedule":true,"manage_teams":true}'::jsonb
    else '{}'::jsonb end,
  'active',now()
from public.organization_memberships m
join public.business_workspaces w on w.organization_id=m.org_id
  and w.workspace_type='organization' and w.status='active'
where m.status='active'
on conflict(workspace_id,user_id) do update set
  roles=(select array_agg(distinct role_name) from unnest(public.workspace_memberships.roles||excluded.roles) role_name),
  permissions=public.workspace_memberships.permissions||excluded.permissions,
  status='active',updated_at=now();

-- Older mobile builds call the fee label `name`; org_fees requires `title`.
create or replace function public.normalize_org_fee_title()
returns trigger language plpgsql set search_path=public as $$
begin
  new.title:=coalesce(nullif(trim(new.title),''),nullif(trim(new.name),''),nullif(trim(new.description),''));
  if new.title is null then raise exception using errcode='23502',message='A fee title is required'; end if;
  if new.name is null then new.name:=new.title; end if;
  return new;
end $$;
drop trigger if exists normalize_org_fee_title_trigger on public.org_fees;
create trigger normalize_org_fee_title_trigger before insert or update on public.org_fees
for each row execute function public.normalize_org_fee_title();

-- Current TestFlight creates tryouts with the authenticated Supabase client.
-- Authorize only active staff of the exact organization on the inserted row.
drop policy if exists org_staff_manage_tryouts on public.org_tryouts;
create policy org_staff_manage_tryouts on public.org_tryouts for all to authenticated
using (exists (
  select 1 from public.organization_memberships m
  where m.org_id=org_tryouts.org_id and m.user_id=auth.uid() and m.status='active'
    and m.role in ('owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
))
with check (exists (
  select 1 from public.organization_memberships m
  where m.org_id=org_tryouts.org_id and m.user_id=auth.uid() and m.status='active'
    and m.role in ('owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
));

-- Atomic organization-document creation for the ten-argument RPC contract
-- used by the current mobile build. All tenant and target IDs are checked on
-- the server before either the document or its targets are written.
create or replace function public.create_org_document_with_targets(
  p_athlete_ids uuid[],
  p_document_id uuid,
  p_document_type text,
  p_file_sha256 text,
  p_is_required boolean,
  p_org_id uuid,
  p_storage_path text,
  p_target_type text,
  p_team_ids uuid[],
  p_title text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_target_type text:=case when lower(trim(coalesce(p_target_type,''))) in ('all','organization') then 'organization' else lower(trim(coalesce(p_target_type,''))) end;
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.org_id=p_org_id and m.user_id=auth.uid() and m.status='active'
      and m.role in ('owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
  ) then raise exception 'Organization document access required'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'Document title is required'; end if;
  if v_target_type not in ('organization','team','athlete') then raise exception 'Invalid document audience'; end if;
  if v_target_type='team' and coalesce(cardinality(p_team_ids),0)=0 then raise exception 'Select at least one team'; end if;
  if v_target_type='athlete' and coalesce(cardinality(p_athlete_ids),0)=0 then raise exception 'Select at least one athlete'; end if;
  if exists (
    select 1 from unnest(coalesce(p_team_ids,'{}'::uuid[])) selected(id)
    where not exists(select 1 from public.org_teams t where t.id=selected.id and t.org_id=p_org_id)
  ) then raise exception 'A selected team does not belong to this organization'; end if;
  if exists (
    select 1 from unnest(coalesce(p_athlete_ids,'{}'::uuid[])) selected(id)
    where not exists(select 1 from public.athlete_organization_memberships a where a.athlete_id=selected.id and a.org_id=p_org_id and a.status='active')
  ) then raise exception 'A selected athlete does not belong to this organization'; end if;

  select id into v_workspace_id from public.business_workspaces
  where organization_id=p_org_id and workspace_type='organization' and status='active';
  if v_workspace_id is null then raise exception 'Active organization workspace not found'; end if;

  insert into public.org_documents(id,org_id,workspace_id,title,document_type,storage_path,file_sha256,is_required)
  values(p_document_id,p_org_id,v_workspace_id,trim(p_title),coalesce(nullif(trim(p_document_type),''),'document'),
    nullif(trim(coalesce(p_storage_path,'')),''),nullif(trim(coalesce(p_file_sha256,'')),''),coalesce(p_is_required,false));

  if v_target_type='organization' then
    insert into public.org_document_targets(document_id,target_type,created_by)
    values(p_document_id,'organization',auth.uid());
  elsif v_target_type='team' then
    insert into public.org_document_targets(document_id,target_type,team_id,created_by)
    select p_document_id,'team',selected.id,auth.uid() from unnest(p_team_ids) selected(id);
  else
    insert into public.org_document_targets(document_id,target_type,athlete_id,created_by)
    select p_document_id,'athlete',selected.id,auth.uid() from unnest(p_athlete_ids) selected(id);
  end if;
  return p_document_id;
end $$;
revoke all on function public.create_org_document_with_targets(uuid[],uuid,text,text,boolean,uuid,text,text,uuid[],text) from public,anon;
grant execute on function public.create_org_document_with_targets(uuid[],uuid,text,text,boolean,uuid,text,text,uuid[],text) to authenticated;

-- Force PostgREST to refresh the RPC signature after this migration.
notify pgrst,'reload schema';
