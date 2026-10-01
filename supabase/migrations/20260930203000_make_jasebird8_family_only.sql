-- jasebird8@gmail.com is a family login for Katie Wu and Rocket Wu.
-- Remove accidental staff/coach authority without touching athlete profiles,
-- athlete organization memberships, registrations, payments, or family data.
-- The live project may still contain this retired trigger function from an
-- older guardian model. Its target table no longer exists, so allowing it to
-- run makes every profiles update fail with 42P01. CASCADE removes its trigger.
drop function if exists public.sync_guardian_links_from_profile() cascade;

do $$
declare
  v_user_id uuid;
begin
  select id
    into v_user_id
  from auth.users
  where lower(trim(email)) = 'jasebird8@gmail.com'
  limit 1;

  if v_user_id is null then
    return;
  end if;

  -- A family login must not remain assigned as a team coach.
  delete from public.org_team_coaches
  where coach_id = v_user_id;

  -- Remove legacy account-level staff memberships while preserving any
  -- athlete membership. Athlete-to-organization membership is separately
  -- stored in athlete_organization_memberships and remains untouched.
  delete from public.organization_memberships
  where user_id = v_user_id
    and role <> 'athlete';

  -- Keep only the athlete role on workspaces that already authorize it.
  -- Staff-only workspace rows are retired so available_workspaces() cannot
  -- return an organization-coach, director, or independent-coach portal.
  update public.workspace_memberships
  set roles = array['athlete']::text[],
      permissions = '{}'::jsonb,
      updated_at = now()
  where user_id = v_user_id
    and status = 'active'
    and 'athlete' = any(roles)
    and roles && array[
      'owner', 'org_admin', 'program_director', 'team_manager',
      'coach', 'assistant_coach', 'league_admin', 'division_admin',
      'finance_manager', 'registrar', 'compliance_manager',
      'read_only_auditor'
    ]::text[];

  update public.workspace_memberships
  set status = 'removed',
      roles = '{}'::text[],
      permissions = '{}'::jsonb,
      updated_at = now()
  where user_id = v_user_id
    and status = 'active'
    and not ('athlete' = any(roles));

  -- Disable any accidentally-created independent coach storefront.
  update public.independent_coach_profiles
  set is_active = false,
      booking_enabled = false,
      updated_at = now()
  where coach_id = v_user_id;

  -- The next login should select an athlete workspace, never a removed
  -- coaching workspace or stale coach acting role.
  delete from public.active_workspace_preferences
  where user_id = v_user_id
    and (
      acting_role <> 'athlete'
      or not exists (
        select 1
        from public.workspace_memberships wm
        where wm.user_id = v_user_id
          and wm.workspace_id = active_workspace_preferences.workspace_id
          and wm.status = 'active'
          and 'athlete' = any(wm.roles)
      )
    );

  update public.profiles
  set role = 'athlete',
      updated_at = now()
  where id = v_user_id
    and role not in ('admin', 'superadmin');
end $$;

