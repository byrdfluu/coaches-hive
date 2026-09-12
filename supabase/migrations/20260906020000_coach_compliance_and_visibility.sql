-- Make coach compliance usable by every supported organization-director role
-- and provide a narrowly-scoped reminder action.

drop policy if exists org_compliance_manage_org on public.org_compliance_items;
create policy org_compliance_manage_org
  on public.org_compliance_items
  for all
  using (public.is_org_director(org_id) or public.is_admin(auth.uid()))
  with check (public.is_org_director(org_id) or public.is_admin(auth.uid()));

create or replace function public.remind_org_compliance_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.org_compliance_items%rowtype;
  v_org_name text;
begin
  select * into v_item from public.org_compliance_items where id = p_item_id;
  if not found then raise exception 'Compliance requirement not found'; end if;
  if not public.is_org_director(v_item.org_id) and not public.is_admin(auth.uid()) then
    raise exception 'Organization administrator access required';
  end if;
  if v_item.assigned_to is null then raise exception 'Assign this requirement before sending a reminder'; end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.org_id=v_item.org_id and m.user_id=v_item.assigned_to
      and coalesce(m.status,'active')='active'
  ) then raise exception 'The assignee is not an active organization member'; end if;

  select org_name into v_org_name from public.org_settings where org_id=v_item.org_id limit 1;
  return public.notify_user(
    v_item.assigned_to,
    'Compliance requirement due',
    coalesce(v_org_name,'Your organization') || ': ' || v_item.title ||
      case when v_item.due_date is null then '' else ' · Due ' || v_item.due_date::text end,
    'compliance_reminder',
    v_item.id
  );
end;
$$;

revoke all on function public.remind_org_compliance_item(uuid) from public, anon;
grant execute on function public.remind_org_compliance_item(uuid) to authenticated;

-- Server-enforced team scope for coaches. Directors retain organization-wide
-- visibility; athletes/parents retain access to their own records.
create or replace function public.can_view_org_team(p_team_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.org_teams t where t.id=p_team_id and (
      public.is_org_director(t.org_id,p_user_id)
      or exists(select 1 from public.org_team_coaches tc where tc.team_id=t.id and tc.coach_id=p_user_id)
      or exists(select 1 from public.org_team_members tm join public.athlete_profiles ap on ap.id=tm.athlete_id
                where tm.team_id=t.id and ap.owner_user_id=p_user_id)
    )
  );
$$;
revoke all on function public.can_view_org_team(uuid,uuid) from public,anon;
grant execute on function public.can_view_org_team(uuid,uuid) to authenticated;

drop policy if exists org_teams_select_member_hardened on public.org_teams;
create policy org_teams_select_scoped on public.org_teams for select
  using(public.can_view_org_team(id) or public.is_admin(auth.uid()));

drop policy if exists org_team_members_select_hardened on public.org_team_members;
create policy org_team_members_select_scoped on public.org_team_members for select
  using(public.owns_athlete_profile(athlete_id) or public.can_view_org_team(team_id) or public.is_admin(auth.uid()));

drop policy if exists sessions_select_hardened on public.sessions;
create policy sessions_select_scoped on public.sessions for select using(
  coach_id=auth.uid() or athlete_id=auth.uid() or public.is_org_director(org_id)
  or (team_id is not null and public.can_view_org_team(team_id)) or public.is_admin(auth.uid())
);

drop policy if exists attendance_select_hardened on public.session_attendance;
create policy attendance_select_scoped on public.session_attendance for select using(
  athlete_id=auth.uid() or exists(
    select 1 from public.sessions s where s.id=session_attendance.session_id and
      (s.coach_id=auth.uid() or public.is_org_director(s.org_id)
       or (s.team_id is not null and public.can_view_org_team(s.team_id)))
  ) or public.is_admin(auth.uid())
);

drop policy if exists practice_plans_select_hardened on public.practice_plans;
create policy practice_plans_select_scoped on public.practice_plans for select using(
  coach_id=auth.uid() or public.is_org_director(org_id)
  or (team_id is not null and public.can_view_org_team(team_id)) or public.is_admin(auth.uid())
);
