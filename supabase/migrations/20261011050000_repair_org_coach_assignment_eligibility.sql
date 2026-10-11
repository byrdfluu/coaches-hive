begin;

-- Offering assignment eligibility follows the authoritative multi-role workspace
-- membership. Keep the legacy organization membership as a compatibility source
-- while older staff records are repaired/backfilled.
create or replace function public.is_active_org_coach(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id=p_user_id
      and coalesce(profile.status,'active')='active'
      and coalesce(profile.is_test,false)=false
      and (
        exists (
          select 1
          from public.business_workspaces workspace
          join public.workspace_memberships membership on membership.workspace_id=workspace.id
          where workspace.organization_id=p_org_id
            and workspace.workspace_type='organization'
            and workspace.status='active'
            and membership.user_id=p_user_id
            and membership.status='active'
            and membership.roles && array['coach','assistant_coach','head_coach']::text[]
        )
        or exists (
          select 1
          from public.organization_memberships membership
          where membership.org_id=p_org_id
            and membership.user_id=p_user_id
            and membership.status='active'
            and membership.role in ('coach','assistant_coach','head_coach')
        )
      )
  )
$$;

create or replace function public.my_org_assignable_coaches(p_org_id uuid)
returns table(coach_id uuid, coach_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.can_manage_org_offering_assignments(p_org_id) then
    raise exception 'organization_coach_list_denied' using errcode='42501';
  end if;

  return query
  with candidates as (
    select membership.user_id
    from public.business_workspaces workspace
    join public.workspace_memberships membership on membership.workspace_id=workspace.id
    where workspace.organization_id=p_org_id
      and workspace.workspace_type='organization'
      and workspace.status='active'
      and membership.status='active'
      and membership.roles && array['coach','assistant_coach','head_coach']::text[]
    union
    select membership.user_id
    from public.organization_memberships membership
    where membership.org_id=p_org_id
      and membership.status='active'
      and membership.role in ('coach','assistant_coach','head_coach')
  )
  select profile.id,
         coalesce(nullif(trim(profile.full_name),''),'Coach')::text,
         profile.avatar_url
  from candidates
  join public.profiles profile on profile.id=candidates.user_id
  where coalesce(profile.status,'active')='active'
    and coalesce(profile.is_test,false)=false
  order by lower(coalesce(nullif(trim(profile.full_name),''),'Coach')),profile.id;
end
$$;

revoke all on function public.is_active_org_coach(uuid,uuid),public.my_org_assignable_coaches(uuid) from public,anon;
grant execute on function public.my_org_assignable_coaches(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
