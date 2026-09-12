-- Ensure the mobile workspace response never emits a null is_last_used value.
-- Safe to rerun after 20260808030000_workspace_authority_and_multi_role.sql.

create or replace function public.available_workspaces()
returns table(
  workspace_id uuid,
  workspace_type text,
  display_name text,
  organization_id uuid,
  roles text[],
  permissions jsonb,
  is_last_used boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.workspace_type,
    w.display_name,
    w.organization_id,
    m.roles,
    m.permissions,
    coalesce(p.workspace_id = w.id, false)
  from public.workspace_memberships m
  join public.business_workspaces w on w.id = m.workspace_id
  left join public.active_workspace_preferences p
    on p.user_id = auth.uid()
  where m.user_id = auth.uid()
    and m.status = 'active'
    and w.status <> 'archived'
  order by coalesce(p.workspace_id = w.id, false) desc, w.display_name;
$$;

revoke all on function public.available_workspaces() from public, anon;
grant execute on function public.available_workspaces() to authenticated;
