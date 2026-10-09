alter table public.practice_plans
  add column if not exists eligible_grades text[] not null default '{}',
  add column if not exists blocked_grades text[] not null default '{}';

create table if not exists public.practice_plan_invitations (
  id uuid primary key default gen_random_uuid(),
  practice_plan_id uuid not null references public.practice_plans(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null default auth.uid(),
  status text not null default 'invited' check(status in ('invited','accepted','declined','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(practice_plan_id,athlete_id)
);
alter table public.practice_plan_invitations enable row level security;
drop policy if exists practice_plan_invitations_read on public.practice_plan_invitations;
create policy practice_plan_invitations_read on public.practice_plan_invitations for select to authenticated using (
  public.owns_athlete_profile(athlete_id)
  or public.is_admin(auth.uid())
  or exists (select 1 from public.practice_plans p where p.id=practice_plan_id and p.team_id is not null and public.can_view_org_team(p.team_id))
);

create table if not exists public.athlete_schedule_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_source text not null check (event_source in ('practice_plan')),
  event_id uuid not null,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  status text not null check (status in ('confirmed','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_source,event_id,athlete_id)
);
alter table public.athlete_schedule_rsvps enable row level security;
drop policy if exists athlete_schedule_rsvps_read on public.athlete_schedule_rsvps;
create policy athlete_schedule_rsvps_read on public.athlete_schedule_rsvps for select to authenticated using (
  public.owns_athlete_profile(athlete_id)
  or public.is_admin(auth.uid())
  or exists (
    select 1 from public.practice_plans p
    where p.id = athlete_schedule_rsvps.event_id
      and p.team_id is not null and public.can_view_org_team(p.team_id)
  )
);
drop policy if exists athlete_schedule_rsvps_write on public.athlete_schedule_rsvps;
create policy athlete_schedule_rsvps_write on public.athlete_schedule_rsvps for all to authenticated
using (public.owns_athlete_profile(athlete_id))
with check (
  public.owns_athlete_profile(athlete_id)
  and exists (
    select 1 from public.practice_plans p
    where p.id = athlete_schedule_rsvps.event_id and (
      exists (select 1 from public.practice_plan_invitations i where i.practice_plan_id=p.id and i.athlete_id=athlete_schedule_rsvps.athlete_id and i.status <> 'removed')
      or exists (select 1 from public.org_team_members tm where tm.team_id=p.team_id and tm.athlete_id=athlete_schedule_rsvps.athlete_id)
    )
  )
);
create index if not exists athlete_schedule_rsvps_athlete_idx on public.athlete_schedule_rsvps(athlete_id,event_id);
grant select,insert,update,delete on public.athlete_schedule_rsvps to authenticated;
