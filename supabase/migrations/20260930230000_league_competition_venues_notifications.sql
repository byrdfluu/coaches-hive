-- Sport-neutral league competition rules, venues, conflict protection,
-- configurable standings, and schedule/result notifications.

create table if not exists public.league_competition_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  event_label text not null default 'Game',
  period_label text not null default 'Half',
  period_count integer not null default 2 check (period_count between 1 and 12),
  period_minutes integer not null default 45 check (period_minutes between 1 and 180),
  ties_allowed boolean not null default true,
  overtime_allowed boolean not null default false,
  win_points integer not null default 3 check (win_points between 0 and 10),
  tie_points integer not null default 1 check (tie_points between 0 and 10),
  loss_points integer not null default 0 check (loss_points between 0 and 10),
  tiebreakers text[] not null default array['goal_difference','goals_for','head_to_head'],
  forfeit_home_score integer not null default 3 check (forfeit_home_score between 0 and 100),
  forfeit_away_score integer not null default 0 check (forfeit_away_score between 0 and 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.league_venues (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  surface_name text,
  address text,
  directions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id,name,surface_name)
);

alter table public.league_games
  add column if not exists venue_id uuid references public.league_venues(id) on delete set null;

create index if not exists league_venues_active_idx on public.league_venues(league_id,is_active,name);
create index if not exists league_games_venue_schedule_idx on public.league_games(venue_id,starts_at) where venue_id is not null and status in ('scheduled','in_progress');

alter table public.league_competition_settings enable row level security;
alter table public.league_venues enable row level security;

drop policy if exists league_competition_settings_read on public.league_competition_settings;
create policy league_competition_settings_read on public.league_competition_settings for select to authenticated
using (public.user_has_league_context(league_id) or public.is_admin(auth.uid()));
drop policy if exists league_competition_settings_manage on public.league_competition_settings;
create policy league_competition_settings_manage on public.league_competition_settings for all to authenticated
using (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_schedule') or public.is_admin(auth.uid()))
with check (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_schedule') or public.is_admin(auth.uid()));

drop policy if exists league_venues_read on public.league_venues;
create policy league_venues_read on public.league_venues for select to authenticated
using (public.user_has_league_context(league_id) or public.is_admin(auth.uid()));
drop policy if exists league_venues_manage on public.league_venues;
create policy league_venues_manage on public.league_venues for all to authenticated
using (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_schedule') or public.is_admin(auth.uid()))
with check (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_schedule') or public.is_admin(auth.uid()));

create or replace function public.enforce_league_game_conflicts() returns trigger
language plpgsql set search_path=public as $$
declare v_ends_at timestamptz;
begin
  if new.status not in ('scheduled','in_progress') then return new; end if;
  v_ends_at := coalesce(new.ends_at,new.starts_at + interval '2 hours');
  if exists (
    select 1 from public.league_games g where g.league_id=new.league_id and g.id<>new.id
      and g.status in ('scheduled','in_progress')
      and g.starts_at < v_ends_at and coalesce(g.ends_at,g.starts_at+interval '2 hours') > new.starts_at
      and (g.home_team_id in(new.home_team_id,new.away_team_id) or g.away_team_id in(new.home_team_id,new.away_team_id))
  ) then raise exception using errcode='23P01',message='A selected team already has a game during this time.'; end if;
  if new.venue_id is not null and exists (
    select 1 from public.league_games g where g.league_id=new.league_id and g.id<>new.id and g.venue_id=new.venue_id
      and g.status in ('scheduled','in_progress')
      and g.starts_at < v_ends_at and coalesce(g.ends_at,g.starts_at+interval '2 hours') > new.starts_at
  ) then raise exception using errcode='23P01',message='This venue is already booked during this time.'; end if;
  return new;
end $$;
drop trigger if exists enforce_league_game_conflicts on public.league_games;
create trigger enforce_league_game_conflicts before insert or update of starts_at,ends_at,home_team_id,away_team_id,venue_id,status
on public.league_games for each row execute function public.enforce_league_game_conflicts();

drop function if exists public.league_scoped_standings(uuid,uuid,text,uuid);
create function public.league_scoped_standings(
  p_league_id uuid,p_season_id uuid,p_age_group text default null,p_division_id uuid default null
) returns table(
  team_id uuid,team_name text,division_id uuid,wins integer,losses integer,ties integer,
  points_for bigint,points_against bigint,games_played integer,standing_points integer
) language plpgsql stable security definer set search_path=public as $$
declare v_win integer:=3;v_tie integer:=1;v_loss integer:=0;
begin
  if not (public.user_has_league_context(p_league_id) or public.is_admin(auth.uid())) then raise exception 'Not authorized for this league'; end if;
  if not exists(select 1 from public.league_seasons where id=p_season_id and league_id=p_league_id) then raise exception 'A valid league season is required'; end if;
  select win_points,tie_points,loss_points into v_win,v_tie,v_loss from public.league_competition_settings where league_id=p_league_id;
  v_win:=coalesce(v_win,3);v_tie:=coalesce(v_tie,1);v_loss:=coalesce(v_loss,0);
  return query with records as (
    select t.id team_id,t.name team_name,g.division_id,
      count(*) filter(where (g.home_team_id=t.id and g.home_score>g.away_score) or (g.away_team_id=t.id and g.away_score>g.home_score))::int wins,
      count(*) filter(where (g.home_team_id=t.id and g.home_score<g.away_score) or (g.away_team_id=t.id and g.away_score<g.home_score))::int losses,
      count(*) filter(where g.home_score=g.away_score)::int ties,
      coalesce(sum(case when g.home_team_id=t.id then g.home_score else g.away_score end),0)::bigint points_for,
      coalesce(sum(case when g.home_team_id=t.id then g.away_score else g.home_score end),0)::bigint points_against,
      count(*)::int games_played
    from public.league_games g join public.org_teams t on t.id in(g.home_team_id,g.away_team_id)
    left join public.league_divisions d on d.id=g.division_id
    where g.league_id=p_league_id and g.season_id=p_season_id and g.status='final' and g.result_status='final'
      and g.result_type not in('no_contest','double_forfeit') and (p_division_id is null or g.division_id=p_division_id)
      and (p_age_group is null or coalesce(nullif(btrim(d.age_group),''),'Unassigned')=p_age_group)
    group by t.id,t.name,g.division_id
  ) select r.*,r.wins*v_win+r.ties*v_tie+r.losses*v_loss from records r
    order by (r.wins*v_win+r.ties*v_tie+r.losses*v_loss) desc,(r.points_for-r.points_against) desc,r.points_for desc,r.team_name;
end $$;
revoke all on function public.league_scoped_standings(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.league_scoped_standings(uuid,uuid,text,uuid) to authenticated;

create or replace function public.notify_league_game_change() returns trigger language plpgsql security definer set search_path=public as $$
declare r record;v_title text;v_body text;v_home text;v_away text;
begin
  select name into v_home from public.org_teams where id=new.home_team_id;
  select name into v_away from public.org_teams where id=new.away_team_id;
  if tg_op='INSERT' then v_title:='Game scheduled';v_body:=v_home||' vs '||v_away||' has been scheduled.';
  elsif new.result_status='final' and old.result_status is distinct from new.result_status then v_title:='Result final';v_body:=v_home||' '||coalesce(new.home_score,0)||' – '||coalesce(new.away_score,0)||' '||v_away;
  else v_title:='Game updated';v_body:=v_home||' vs '||v_away||' has changed.'; end if;
  if v_title='Result final' and exists(select 1 from public.league_notification_preferences where league_id=new.league_id and game_results=false) then return new; end if;
  if v_title<>'Result final' and exists(select 1 from public.league_notification_preferences where league_id=new.league_id and schedule_changes=false) then return new; end if;
  for r in
    select distinct om.user_id from public.league_team_assignments lta join public.organization_memberships om on om.org_id=lta.org_id and om.status='active'
    where lta.league_id=new.league_id and lta.team_id in(new.home_team_id,new.away_team_id)
    union select lm.user_id from public.league_memberships lm where lm.league_id=new.league_id and lm.status='active'
  loop perform public.notify_user(r.user_id,v_title,v_body,case when new.result_status='final' then 'result' else 'schedule' end,new.id); end loop;
  return new;
end $$;
drop trigger if exists notify_league_game_change on public.league_games;
create trigger notify_league_game_change after insert or update of starts_at,location,venue_id,status,result_status,home_score,away_score
on public.league_games for each row execute function public.notify_league_game_change();

insert into public.league_competition_settings(league_id,event_label,period_label,period_count,period_minutes,ties_allowed,win_points,tie_points,loss_points)
select id,case when lower(coalesce(sport,''))='soccer' then 'Match' else 'Game' end,
  case when lower(coalesce(sport,''))='soccer' then 'Half' when lower(coalesce(sport,'')) in('basketball','football') then 'Quarter' else 'Period' end,
  case when lower(coalesce(sport,''))='soccer' then 2 when lower(coalesce(sport,'')) in('basketball','football') then 4 else 2 end,
  case when lower(coalesce(sport,''))='soccer' then 45 when lower(coalesce(sport,''))='basketball' then 8 when lower(coalesce(sport,''))='football' then 12 else 20 end,
  lower(coalesce(sport,''))<>'basketball',case when lower(coalesce(sport,''))='soccer' then 3 else 1 end,
  case when lower(coalesce(sport,''))='soccer' then 1 else 0 end,0
from public.leagues on conflict(league_id) do nothing;

