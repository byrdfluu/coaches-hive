-- Every organization owner may also operate as a coach inside the organization.
-- This is an organization-scoped persona only: it does not create an
-- independent-coach workspace, storefront, subscription, or billing account.

create or replace function public.ensure_organization_owner_coach_persona()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  workspace_row public.business_workspaces%rowtype;
begin
  select * into workspace_row
  from public.business_workspaces
  where id = new.workspace_id;

  if workspace_row.workspace_type = 'organization'
     and workspace_row.owner_user_id = new.user_id
     and new.status = 'active'
     and not ('coach' = any(coalesce(new.roles, '{}'::text[]))) then
    new.roles := array(
      select distinct role_name
      from unnest(coalesce(new.roles, '{}'::text[]) || array['coach']::text[]) role_name
    );
    new.permissions := coalesce(new.permissions, '{}'::jsonb) ||
      '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_organization_owner_coach_persona_trigger
  on public.workspace_memberships;
create trigger ensure_organization_owner_coach_persona_trigger
before insert or update of workspace_id, user_id, roles, permissions, status
on public.workspace_memberships
for each row execute function public.ensure_organization_owner_coach_persona();

-- Repair owners created before the trigger existed, including an owner whose
-- primary organization role is represented as org_admin in legacy data.
update public.workspace_memberships membership
set roles = array(
      select distinct role_name
      from unnest(coalesce(membership.roles, '{}'::text[]) || array['coach']::text[]) role_name
    ),
    permissions = coalesce(membership.permissions, '{}'::jsonb) ||
      '{"request_athletes":true,"view_assigned_athletes":true,"manage_schedule":true,"send_documents":true}'::jsonb,
    updated_at = now()
from public.business_workspaces workspace
where workspace.id = membership.workspace_id
  and workspace.workspace_type = 'organization'
  and workspace.status = 'active'
  and workspace.owner_user_id = membership.user_id
  and membership.status = 'active'
  and not ('coach' = any(coalesce(membership.roles, '{}'::text[])));

-- Keep the workspace switcher label aligned with the canonical organization
-- identity. This updates the existing organization workspace only.
update public.business_workspaces workspace
set display_name = settings.org_name,
    updated_at = now()
from public.org_settings settings
where settings.org_id = workspace.organization_id
  and workspace.workspace_type = 'organization'
  and workspace.status = 'active'
  and nullif(btrim(settings.org_name), '') is not null
  and workspace.display_name is distinct from settings.org_name;

comment on function public.ensure_organization_owner_coach_persona() is
  'Keeps the paid organization owner coach-capable inside that organization without creating an independent coach business.';
