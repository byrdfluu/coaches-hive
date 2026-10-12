-- Reconcile the league management RPCs and game fields used by both clients.
-- These contracts existed in the mobile migration history but were missing
-- from the maintained web/backend migration set.

alter table public.league_games add column if not exists ends_at timestamptz;
alter table public.league_games add column if not exists result_status text not null default 'not_submitted';
alter table public.league_games add column if not exists result_type text not null default 'played';
alter table public.league_games add column if not exists submitted_for_team_id uuid references public.org_teams(id) on delete set null;
alter table public.league_games add column if not exists submitted_by_org_id uuid references public.organizations(id) on delete set null;
alter table public.league_games add column if not exists submitted_at timestamptz;
alter table public.league_games add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;
alter table public.league_games add column if not exists confirmed_at timestamptz;
alter table public.league_games add column if not exists disputed_by uuid references public.profiles(id) on delete set null;
alter table public.league_games add column if not exists disputed_at timestamptz;
alter table public.league_games add column if not exists dispute_reason text;
alter table public.league_games add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.league_games add column if not exists approved_at timestamptz;
alter table public.league_games add column if not exists correction_reason text;
alter table public.league_games add column if not exists result_version integer not null default 0;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='league_games_result_status_check') then
    alter table public.league_games add constraint league_games_result_status_check
      check(result_status in ('not_submitted','pending_confirmation','disputed','pending_league_review','final','reopened'));
  end if;
  if not exists(select 1 from pg_constraint where conname='league_games_result_type_check') then
    alter table public.league_games add constraint league_games_result_type_check
      check(result_type in ('played','home_forfeit','away_forfeit','double_forfeit','no_contest'));
  end if;
  if not exists(select 1 from pg_constraint where conname='league_games_nonnegative_scores_check') then
    alter table public.league_games add constraint league_games_nonnegative_scores_check
      check((home_score is null or home_score>=0) and (away_score is null or away_score>=0));
  end if;
end $$;

create or replace function public.org_has_active_subscription(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_subscriptions
    where organization_id=p_org_id and status in ('active','trialing'));
$$;

create or replace function public.league_has_active_subscription(p_league_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_subscriptions ps
    join public.business_workspaces w on w.id=ps.workspace_id
    where w.league_id=p_league_id and w.workspace_type='league'
      and ps.status in ('active','trialing') and ps.plan_key='league_enterprise');
$$;

create or replace function public.add_organization_to_league(p_league_id uuid,p_org_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not (public.is_league_admin(p_league_id) or public.league_has_permission(p_league_id,'manage_organizations') or public.is_admin(auth.uid())) then
    raise exception 'League admin permission required';
  end if;
  if not public.is_admin(auth.uid()) then
    if not public.league_has_active_subscription(p_league_id) then
      raise exception 'This league needs an active League & Enterprise plan before it can add organizations.';
    end if;
    if not public.org_has_active_subscription(p_org_id) then
      raise exception 'That organization needs an active Coaches Hive plan before it can join this league.';
    end if;
  end if;
  insert into public.league_organizations(league_id,org_id,status)
  values(p_league_id,p_org_id,'active')
  on conflict(league_id,org_id) do update set status='active'
  returning id into v_id;
  insert into public.league_audit_events(league_id,actor_user_id,event_type,record_type,record_id)
  values(p_league_id,auth.uid(),'organization_added','league_organizations',v_id);
  return v_id;
end $$;

create or replace function public.league_set_active_season(p_league_id uuid,p_season_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.is_league_admin(p_league_id) or public.league_has_permission(p_league_id,'manage_seasons') or public.is_admin(auth.uid())) then
    raise exception 'Not authorized to manage seasons for this league';
  end if;
  if not exists(select 1 from public.league_seasons where id=p_season_id and league_id=p_league_id) then
    raise exception 'Season does not belong to this league';
  end if;
  update public.league_seasons set is_active=false where league_id=p_league_id and id<>p_season_id and is_active;
  update public.league_seasons set is_active=true where id=p_season_id;
end $$;

create or replace function public.user_can_manage_league_results(p_league_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_league_admin(p_league_id,p_user_id)
    or public.league_has_permission(p_league_id,'manage_results',p_user_id)
    or public.league_has_permission(p_league_id,'manage_schedule',p_user_id)
    or public.is_admin(p_user_id);
$$;

create or replace function public.approve_league_game_result(
  p_game_id uuid,p_home_score integer,p_away_score integer,
  p_result_type text default 'played',p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare g public.league_games%rowtype;
begin
  select * into g from public.league_games where id=p_game_id for update;
  if g.id is null then raise exception 'Game not found'; end if;
  if not public.user_can_manage_league_results(g.league_id) then raise exception 'League result permission required'; end if;
  if p_result_type not in ('played','home_forfeit','away_forfeit','double_forfeit','no_contest') then raise exception 'Invalid result type'; end if;
  if p_result_type not in ('double_forfeit','no_contest') and (p_home_score is null or p_away_score is null or p_home_score<0 or p_away_score<0) then
    raise exception 'Scores must be zero or greater';
  end if;
  update public.league_games set home_score=p_home_score,away_score=p_away_score,result_type=p_result_type,
    result_status='final',status='final',approved_by=auth.uid(),approved_at=now(),
    correction_reason=nullif(btrim(p_note),''),updated_at=now()
  where id=p_game_id;
  insert into public.league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata)
  values(g.league_id,auth.uid(),'game_result_approved','league_game',g.id,
    jsonb_build_object('result_type',p_result_type,'note',p_note,'home_score',p_home_score,'away_score',p_away_score));
end $$;

revoke all on function public.org_has_active_subscription(uuid),public.league_has_active_subscription(uuid),
  public.add_organization_to_league(uuid,uuid),public.league_set_active_season(uuid,uuid),
  public.user_can_manage_league_results(uuid,uuid),
  public.approve_league_game_result(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.org_has_active_subscription(uuid),public.league_has_active_subscription(uuid),
  public.add_organization_to_league(uuid,uuid),public.league_set_active_season(uuid,uuid),
  public.user_can_manage_league_results(uuid,uuid),
  public.approve_league_game_result(uuid,integer,integer,text,text) to authenticated;

do $$
declare t text;perm text;
begin
  for t,perm in select * from jsonb_each_text('{"league_organizations":"manage_organizations","league_seasons":"manage_seasons","league_divisions":"manage_divisions","league_team_assignments":"manage_teams","league_games":"manage_schedule"}'::jsonb)
  loop
    execute format('drop policy if exists %I on public.%I','admin_manage_'||t,t);
    execute format('create policy %I on public.%I for all to authenticated using(public.is_league_admin(league_id) or public.league_has_permission(league_id,%L) or public.is_admin(auth.uid())) with check(public.is_league_admin(league_id) or public.league_has_permission(league_id,%L) or public.is_admin(auth.uid()))','admin_manage_'||t,t,perm,perm);
  end loop;
end $$;
