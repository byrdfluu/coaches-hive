-- Support is available to every authenticated account, independent of its
-- active portal, workspace role, or organization permissions. Coach team
-- assignments are also reconciled for single-team organizations so a valid
-- coach persona cannot intermittently appear unassigned.

create or replace function public.submit_support_ticket(
  p_subject text,
  p_description text default '',
  p_category text default 'general',
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket_id uuid;
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_category text := lower(btrim(coalesce(p_category, 'general')));
  v_priority text := lower(btrim(coalesce(p_priority, 'normal')));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_subject is null then
    raise exception 'Subject is required' using errcode = '22023';
  end if;
  if length(v_subject) > 200 then
    raise exception 'Subject must be 200 characters or fewer' using errcode = '22023';
  end if;
  if coalesce(length(v_description), 0) > 10000 then
    raise exception 'Description must be 10000 characters or fewer' using errcode = '22023';
  end if;
  if v_category not in ('general','billing','technical','account','coach','content','other') then
    raise exception 'Invalid support category' using errcode = '22023';
  end if;
  if v_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid support priority' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'Your account profile is still being prepared. Please try again.' using errcode = '55000';
  end if;

  insert into public.support_tickets(user_id, subject, description, category, priority)
  values(v_user_id, v_subject, v_description, v_category, v_priority)
  returning id into v_ticket_id;

  return v_ticket_id;
end;
$$;

revoke all on function public.submit_support_ticket(text,text,text,text) from public, anon;
grant execute on function public.submit_support_ticket(text,text,text,text) to authenticated;

create or replace function public.reconcile_single_team_org_coach(
  p_user_id uuid,
  p_org_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if p_user_id is null or p_org_id is null then return; end if;

  -- Only reconcile a user who still has active coach authority. Owners and
  -- organization admins qualify only when their workspace explicitly carries
  -- a coach/program-director persona.
  if not (
    exists (
      select 1 from public.organization_memberships om
      where om.user_id = p_user_id and om.org_id = p_org_id
        and om.status = 'active'
        and om.role in ('coach','assistant_coach','program_director')
    )
    or exists (
      select 1
      from public.business_workspaces w
      join public.workspace_memberships wm on wm.workspace_id = w.id
      where w.organization_id = p_org_id
        and w.workspace_type = 'organization'
        and w.status = 'active'
        and wm.user_id = p_user_id
        and wm.status = 'active'
        and wm.roles && array['coach','assistant_coach','program_director']::text[]
    )
  ) then return; end if;

  -- Never guess among multiple teams. Multi-team coach invitations retain
  -- their explicit team selection; a one-team organization is unambiguous.
  if (select count(*) from public.org_teams t where t.org_id = p_org_id) = 1 then
    select t.id into v_team_id
    from public.org_teams t
    where t.org_id = p_org_id
    limit 1;
  end if;

  if v_team_id is not null then
    insert into public.org_team_coaches(team_id, coach_id)
    values(v_team_id, p_user_id)
    on conflict(team_id, coach_id) do nothing;
  end if;
end;
$$;

revoke all on function public.reconcile_single_team_org_coach(uuid,uuid) from public, anon, authenticated;

create or replace function public.reconcile_org_coach_assignment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if tg_table_name = 'organization_memberships' then
    perform public.reconcile_single_team_org_coach(new.user_id, new.org_id);
  elsif tg_table_name = 'workspace_memberships' then
    select w.organization_id into v_org_id
    from public.business_workspaces w where w.id = new.workspace_id;
    perform public.reconcile_single_team_org_coach(new.user_id, v_org_id);
  elsif tg_table_name = 'org_teams' then
    perform public.reconcile_single_team_org_coach(candidate.user_id, new.org_id)
    from (
      select om.user_id from public.organization_memberships om
      where om.org_id = new.org_id and om.status = 'active'
        and om.role in ('coach','assistant_coach','program_director')
      union
      select wm.user_id from public.business_workspaces w
      join public.workspace_memberships wm on wm.workspace_id = w.id
      where w.organization_id = new.org_id and w.workspace_type = 'organization'
        and w.status = 'active' and wm.status = 'active'
        and wm.roles && array['coach','assistant_coach','program_director']::text[]
    ) candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_org_membership_coach_team on public.organization_memberships;
create trigger reconcile_org_membership_coach_team
after insert or update of role,status on public.organization_memberships
for each row execute function public.reconcile_org_coach_assignment_trigger();

drop trigger if exists reconcile_workspace_membership_coach_team on public.workspace_memberships;
create trigger reconcile_workspace_membership_coach_team
after insert or update of roles,status on public.workspace_memberships
for each row execute function public.reconcile_org_coach_assignment_trigger();

drop trigger if exists reconcile_new_org_team_coaches on public.org_teams;
create trigger reconcile_new_org_team_coaches
after insert on public.org_teams
for each row execute function public.reconcile_org_coach_assignment_trigger();

-- Repair existing unambiguous organization coach personas.
select public.reconcile_single_team_org_coach(candidate.user_id, candidate.org_id)
from (
  select om.user_id, om.org_id
  from public.organization_memberships om
  where om.status = 'active' and om.role in ('coach','assistant_coach','program_director')
  union
  select wm.user_id, w.organization_id
  from public.business_workspaces w
  join public.workspace_memberships wm on wm.workspace_id = w.id
  where w.workspace_type = 'organization' and w.status = 'active'
    and w.organization_id is not null and wm.status = 'active'
    and wm.roles && array['coach','assistant_coach','program_director']::text[]
) candidate;

create or replace function public.my_coach_team_contexts()
returns table(workspace_id uuid,organization_id uuid,organization_name text,team_id uuid,team_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct w.id, w.organization_id, w.display_name, t.id, t.name
  from public.business_workspaces w
  join public.workspace_memberships wm
    on wm.workspace_id = w.id
   and wm.user_id = auth.uid()
   and wm.status = 'active'
   and wm.roles && array['coach','assistant_coach','program_director']::text[]
  join public.org_teams t on t.org_id = w.organization_id
  join public.org_team_coaches tc on tc.team_id = t.id and tc.coach_id = auth.uid()
  where w.workspace_type = 'organization' and w.status = 'active'
  order by w.display_name, t.name;
$$;

revoke all on function public.my_coach_team_contexts() from public, anon;
grant execute on function public.my_coach_team_contexts() to authenticated;

notify pgrst, 'reload schema';
