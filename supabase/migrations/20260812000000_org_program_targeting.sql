-- Audience targeting for programs (camps/leagues/clinics), mirroring
-- org_document_targets so directors can restrict a program to specific
-- teams/athletes instead of the whole organization.

create table if not exists public.org_program_targets (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  target_type text not null check (target_type in ('organization', 'team', 'athlete')),
  team_id uuid references public.org_teams(id) on delete cascade,
  athlete_id uuid references public.athlete_profiles(id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (target_type = 'organization' and team_id is null and athlete_id is null) or
    (target_type = 'team' and team_id is not null and athlete_id is null) or
    (target_type = 'athlete' and athlete_id is not null and team_id is null)
  )
);

create unique index if not exists org_program_targets_org_uidx
  on public.org_program_targets(program_id) where target_type = 'organization';
create unique index if not exists org_program_targets_team_uidx
  on public.org_program_targets(program_id, team_id) where target_type = 'team';
create unique index if not exists org_program_targets_athlete_uidx
  on public.org_program_targets(program_id, athlete_id) where target_type = 'athlete';

alter table public.org_program_targets enable row level security;

drop policy if exists org_program_targets_director_all on public.org_program_targets;
create policy org_program_targets_director_all
  on public.org_program_targets for all
  using (
    exists (
      select 1 from public.programs p
      where p.id = org_program_targets.program_id
        and public.is_org_director(p.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.programs p
      where p.id = org_program_targets.program_id
        and public.is_org_director(p.org_id)
    )
  );

-- Every pre-existing program (created before targeting existed) defaults to
-- visible to the whole org, preserving current behavior.
insert into public.org_program_targets (program_id, target_type)
select p.id, 'organization'
from public.programs p
where not exists (
  select 1 from public.org_program_targets t where t.program_id = p.id
);

create or replace function public.is_org_program_visible(
  target_program_id uuid,
  target_athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.programs p
    join public.athlete_organization_memberships aom
      on aom.org_id = p.org_id
     and aom.athlete_id = target_athlete_id
     and aom.status = 'active'
    where p.id = target_program_id
      and exists (
        select 1
        from public.org_program_targets t
        where t.program_id = p.id
          and (
            t.target_type = 'organization'
            or (t.target_type = 'athlete' and t.athlete_id = target_athlete_id)
            or (
              t.target_type = 'team'
              and exists (
                select 1 from public.org_team_members tm
                where tm.team_id = t.team_id and tm.athlete_id = target_athlete_id
              )
            )
          )
      )
  );
$$;

revoke all on function public.is_org_program_visible(uuid, uuid) from public, anon;
grant execute on function public.is_org_program_visible(uuid, uuid) to authenticated;

-- Replaces a program's target rows in one call. Directors call this right
-- after creating or editing a program (the program row itself is still
-- inserted/updated directly from the client).
create or replace function public.set_org_program_targets(
  p_program_id uuid,
  p_org_id uuid,
  p_target_type text,
  p_team_ids uuid[] default '{}',
  p_athlete_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_org_director(p_org_id) then raise exception 'Organization director access required'; end if;
  if p_target_type not in ('organization', 'team', 'athlete') then raise exception 'Invalid program audience'; end if;
  if not exists (select 1 from public.programs p where p.id = p_program_id and p.org_id = p_org_id) then
    raise exception 'Program not found in this organization';
  end if;
  if p_target_type = 'team' and coalesce(cardinality(p_team_ids), 0) = 0 then
    raise exception 'Select at least one team';
  end if;
  if p_target_type = 'athlete' and coalesce(cardinality(p_athlete_ids), 0) = 0 then
    raise exception 'Select at least one athlete';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_team_ids, '{}')) as selected(team_id)
    where not exists (select 1 from public.org_teams t where t.id = selected.team_id and t.org_id = p_org_id)
  ) then raise exception 'A selected team does not belong to this organization'; end if;
  if exists (
    select 1 from unnest(coalesce(p_athlete_ids, '{}')) as selected(athlete_id)
    where not exists (
      select 1 from public.athlete_organization_memberships aom
      where aom.athlete_id = selected.athlete_id and aom.org_id = p_org_id and aom.status = 'active'
    )
  ) then raise exception 'A selected athlete does not belong to this organization'; end if;

  delete from public.org_program_targets where program_id = p_program_id;

  if p_target_type = 'organization' then
    insert into public.org_program_targets(program_id, target_type)
    values (p_program_id, 'organization');
  elsif p_target_type = 'team' then
    insert into public.org_program_targets(program_id, target_type, team_id)
    select p_program_id, 'team', selected.id from unnest(p_team_ids) as selected(id);
  else
    insert into public.org_program_targets(program_id, target_type, athlete_id)
    select p_program_id, 'athlete', selected.id from unnest(p_athlete_ids) as selected(id);
  end if;
end;
$$;

revoke all on function public.set_org_program_targets(uuid, uuid, text, uuid[], uuid[]) from public, anon;
grant execute on function public.set_org_program_targets(uuid, uuid, text, uuid[], uuid[]) to authenticated;

-- Athlete-facing: active programs from orgs they belong to, filtered by
-- target audience.
create or replace function public.assigned_org_programs_for_athlete(p_athlete_id uuid)
returns table (
  id uuid,
  org_id uuid,
  name text,
  type text,
  description text,
  start_date date,
  end_date date,
  price numeric,
  capacity int,
  location text,
  status text,
  coach_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.org_id, p.name, p.type, p.description, p.start_date, p.end_date,
         p.price, p.capacity, p.location, p.status, p.coach_id, p.created_at
  from public.programs p
  where public.owns_athlete_profile(p_athlete_id)
    and p.status = 'active'
    and public.is_org_program_visible(p.id, p_athlete_id)
  order by p.start_date asc nulls last;
$$;

revoke all on function public.assigned_org_programs_for_athlete(uuid) from public, anon;
grant execute on function public.assigned_org_programs_for_athlete(uuid) to authenticated;

-- Director-facing: current audience selection for a program (for the edit form).
create or replace function public.org_program_target_summary(p_program_id uuid)
returns table (
  target_type text,
  team_ids uuid[],
  athlete_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select t.target_type from public.org_program_targets t
              where t.program_id = p_program_id limit 1), 'organization'),
    coalesce(array_agg(t.team_id) filter (where t.team_id is not null), '{}'),
    coalesce(array_agg(t.athlete_id) filter (where t.athlete_id is not null), '{}')
  from public.org_program_targets t
  where t.program_id = p_program_id;
$$;

revoke all on function public.org_program_target_summary(uuid) from public, anon;
grant execute on function public.org_program_target_summary(uuid) to authenticated;
