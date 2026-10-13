-- Audited coach and league-staff game-day actions shared by mobile and web.

create table if not exists public.league_game_requests (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  game_id uuid not null references public.league_games(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('result_dispute','cancellation','reschedule','home_forfeit','away_forfeit','double_forfeit')),
  reason text,
  proposed_starts_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','declined','resolved','withdrawn')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.league_game_requests enable row level security;
drop policy if exists league_game_requests_read on public.league_game_requests;
create policy league_game_requests_read on public.league_game_requests for select to authenticated using (
  requested_by=auth.uid() or public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_schedule')
);
grant select on public.league_game_requests to authenticated;
grant all on public.league_game_requests to service_role;

create or replace function public.submit_league_game_action(
  p_game_id uuid,p_action text,p_home_score integer default null,p_away_score integer default null,
  p_reason text default null,p_proposed_starts_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare g public.league_games; v_id uuid; v_authorized boolean;
begin
  select * into g from public.league_games where id=p_game_id;
  if g.id is null then raise exception 'League game not found'; end if;
  select public.is_league_admin(g.league_id) or public.league_has_permission(g.league_id,'manage_schedule') or exists(
    select 1 from public.org_team_coaches tc where tc.coach_id=auth.uid() and tc.team_id in(g.home_team_id,g.away_team_id)
  ) into v_authorized;
  if not v_authorized then raise exception 'You are not authorized for this game'; end if;
  if p_action='submit_score' then
    if p_home_score is null or p_away_score is null or p_home_score<0 or p_away_score<0 then raise exception 'Valid scores are required'; end if;
    update public.league_games set home_score=p_home_score,away_score=p_away_score,result_status='pending_confirmation',submitted_by=auth.uid(),updated_at=now() where id=g.id;
    v_id:=g.id;
  elsif p_action in ('result_dispute','cancellation','reschedule','home_forfeit','away_forfeit','double_forfeit') then
    if p_action='reschedule' and p_proposed_starts_at is null then raise exception 'A proposed start time is required'; end if;
    insert into public.league_game_requests(league_id,game_id,requested_by,request_type,reason,proposed_starts_at)
    values(g.league_id,g.id,auth.uid(),p_action,nullif(btrim(p_reason),''),p_proposed_starts_at) returning id into v_id;
    if p_action='result_dispute' then update public.league_games set result_status='disputed',updated_at=now() where id=g.id; end if;
  else raise exception 'Unsupported game action'; end if;
  insert into public.league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata)
  values(g.league_id,auth.uid(),'game.'||p_action,'league_game',g.id,jsonb_build_object('request_id',v_id,'reason',p_reason,'proposed_starts_at',p_proposed_starts_at,'home_score',p_home_score,'away_score',p_away_score));
  return v_id;
end $$;
revoke all on function public.submit_league_game_action(uuid,text,integer,integer,text,timestamptz) from public,anon;
grant execute on function public.submit_league_game_action(uuid,text,integer,integer,text,timestamptz) to authenticated;

create or replace function public.review_league_game_request(p_request_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.league_game_requests; g public.league_games;
begin
  select * into r from public.league_game_requests where id=p_request_id for update;
  if r.id is null then raise exception 'Game request not found'; end if;
  if not (public.is_league_admin(r.league_id) or public.league_has_permission(r.league_id,'manage_schedule')) then raise exception 'League schedule permission required'; end if;
  if r.status<>'pending' then raise exception 'This request has already been reviewed'; end if;
  if p_decision not in ('approved','declined') then raise exception 'Invalid review decision'; end if;
  select * into g from public.league_games where id=r.game_id for update;
  if p_decision='approved' then
    if r.request_type='cancellation' then update public.league_games set status='cancelled',updated_at=now() where id=g.id;
    elsif r.request_type='reschedule' then update public.league_games set starts_at=r.proposed_starts_at,status='scheduled',updated_at=now() where id=g.id;
    elsif r.request_type in ('home_forfeit','away_forfeit','double_forfeit') then
      update public.league_games set result_type=r.request_type,result_status='final',status='final',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=g.id;
    elsif r.request_type='result_dispute' then update public.league_games set result_status='pending_league_review',updated_at=now() where id=g.id;
    end if;
  elsif r.request_type='result_dispute' then update public.league_games set result_status='pending_confirmation',updated_at=now() where id=g.id; end if;
  update public.league_game_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
  insert into public.league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata)
  values(r.league_id,auth.uid(),'game_request.'||p_decision,'league_game_request',r.id,jsonb_build_object('request_type',r.request_type,'game_id',r.game_id,'note',p_note));
end $$;
revoke all on function public.review_league_game_request(uuid,text,text) from public,anon;
grant execute on function public.review_league_game_request(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
