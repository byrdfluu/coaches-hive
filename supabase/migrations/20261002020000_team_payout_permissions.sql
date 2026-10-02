-- Forward-only follow-up for deployments that already applied the expanded
-- offering billing migration. Team-first owners need the same capability in
-- available_workspaces() that the dashboard endpoint authorizes.
update public.workspace_memberships membership
set permissions = coalesce(membership.permissions, '{}'::jsonb)
  || '{"manage_payments":true,"manage_connect":true}'::jsonb
from public.business_workspaces workspace
join public.independent_coach_profiles coach_profile
  on coach_profile.coach_id = workspace.owner_user_id
where membership.workspace_id = workspace.id
  and membership.user_id = workspace.owner_user_id
  and membership.status = 'active'
  and workspace.workspace_type = 'independent_coach'
  and workspace.status = 'active'
  and coach_profile.is_active = true
  and coach_profile.operating_mode in ('single_team','both');

notify pgrst, 'reload schema';
