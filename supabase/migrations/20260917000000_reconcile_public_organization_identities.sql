-- Restore canonical organization identities for active organization workspaces
-- that already have authoritative mobile profile/settings data. This makes the
-- permanent organization UUID resolvable on web without changing memberships,
-- teams, payments, or workspace ownership.

insert into public.organizations (id, name, org_type, status)
select
  settings.org_id,
  coalesce(nullif(trim(settings.org_name), ''), workspace.display_name, 'Organization'),
  'organization',
  'active'
from public.org_settings settings
join public.business_workspaces workspace
  on workspace.organization_id = settings.org_id
 and workspace.workspace_type = 'organization'
 and lower(coalesce(workspace.status, '')) = 'active'
left join public.organizations organization on organization.id = settings.org_id
where organization.id is null
on conflict (id) do nothing;

notify pgrst, 'reload schema';
