-- Web/backend half of the mobile league contract. Safe to apply after the
-- league foundation migration; every schema change is additive/idempotent.

alter table public.leagues
  add column if not exists description text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists profile_image_url text,
  add column if not exists website_url text,
  add column if not exists is_public boolean not null default true,
  add column if not exists accepting_join_requests boolean not null default true;

alter table public.stripe_connect_accounts drop constraint if exists stripe_connect_accounts_owner_type_check;
alter table public.stripe_connect_accounts add constraint stripe_connect_accounts_owner_type_check check(owner_type in ('coach','org','league'));
alter table public.stripe_connect_accounts add column if not exists league_id uuid references public.leagues(id) on delete cascade;
create unique index if not exists stripe_connect_accounts_league_uidx on public.stripe_connect_accounts(league_id) where owner_type='league';
alter table public.league_fee_assignments add column if not exists checkout_session_id text;

create table if not exists public.league_join_requests (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_type text not null check(requester_type in ('coach','athlete','organization','other')),
  org_id uuid references public.organizations(id) on delete cascade,
  athlete_id uuid references public.athlete_profiles(id) on delete set null,
  message text, status text not null default 'pending' check(status in ('pending','approved','declined','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists league_join_requests_open_uidx on public.league_join_requests(league_id,requester_id,coalesce(org_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status='pending';
alter table public.league_join_requests enable row level security;
drop policy if exists league_join_requests_read on public.league_join_requests;
create policy league_join_requests_read on public.league_join_requests for select to authenticated using(requester_id=auth.uid() or public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_registrations') or public.is_admin(auth.uid()));

create or replace function public.public_league_profiles()
returns table(id uuid,name text,sport text,general_location text,description text,contact_email text,contact_phone text,profile_image_url text,website_url text,accepting_join_requests boolean,organization_count bigint,team_count bigint,division_count bigint,request_status text)
language sql stable security definer set search_path=public as $$
 select l.id,l.name,l.sport,l.general_location,l.description,l.contact_email,l.contact_phone,l.profile_image_url,l.website_url,l.accepting_join_requests,
 (select count(*) from league_organizations lo where lo.league_id=l.id and lo.status='active'),
 (select count(*) from league_team_assignments ta where ta.league_id=l.id and ta.status='active'),
 (select count(*) from league_divisions d where d.league_id=l.id),
 (select jr.status from league_join_requests jr where jr.league_id=l.id and jr.requester_id=auth.uid() order by jr.created_at desc limit 1)
 from leagues l where l.status='active' and l.is_public=true order by l.name
$$;
revoke all on function public.public_league_profiles() from public,anon;
grant execute on function public.public_league_profiles() to authenticated;

drop function if exists public.request_to_join_league(uuid,text,uuid,text);
create or replace function public.request_to_join_league(p_league_id uuid,p_requester_type text,p_org_id uuid default null,p_message text default null,p_athlete_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to request access'; end if;
 if p_requester_type not in ('coach','athlete','organization','other') then raise exception 'Choose a valid request type'; end if;
 if not exists(select 1 from leagues where id=p_league_id and status='active' and is_public and accepting_join_requests) then raise exception 'This league is not accepting join requests'; end if;
 if p_requester_type='organization' and (p_org_id is null or not public.is_org_director(p_org_id,auth.uid())) then raise exception 'You must administer that organization to submit this request'; end if;
 if p_requester_type='athlete' and (p_athlete_id is null or not exists(select 1 from athlete_profiles where id=p_athlete_id and owner_user_id=auth.uid())) then raise exception 'Choose an athlete profile you manage'; end if;
 insert into league_join_requests(league_id,requester_id,requester_type,org_id,athlete_id,message) values(p_league_id,auth.uid(),p_requester_type,case when p_requester_type='organization' then p_org_id end,case when p_requester_type='athlete' then p_athlete_id end,nullif(trim(p_message),'')) returning id into v_id;
 insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata) values(p_league_id,auth.uid(),'join_request_submitted','league_join_request',v_id,jsonb_build_object('requester_type',p_requester_type));
 return v_id;
end $$;
revoke all on function public.request_to_join_league(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.request_to_join_league(uuid,text,uuid,text,uuid) to authenticated;

create or replace function public.league_join_request_roster(p_league_id uuid)
returns table(id uuid,requester_type text,requester_name text,requester_email text,organization_name text,message text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select jr.id,jr.requester_type,coalesce(p.full_name,p.email,'Member'),p.email,case when jr.org_id is null then null else coalesce(os.org_name,'Organization') end,jr.message,jr.status,jr.created_at
 from league_join_requests jr join profiles p on p.id=jr.requester_id left join org_settings os on os.org_id=jr.org_id
 where jr.league_id=p_league_id and (public.is_league_admin(p_league_id) or public.league_has_permission(p_league_id,'manage_registrations') or public.is_admin(auth.uid())) order by jr.created_at desc
$$;
revoke all on function public.league_join_request_roster(uuid) from public,anon;
grant execute on function public.league_join_request_roster(uuid) to authenticated;

create or replace function public.review_league_join_request(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r league_join_requests%rowtype; v_season uuid; v_org uuid; v_team uuid;
begin
 select * into r from league_join_requests where id=p_request_id for update;
 if not found then raise exception 'Join request not found'; end if;
 if not(public.is_league_admin(r.league_id) or public.league_has_permission(r.league_id,'manage_registrations') or public.is_admin(auth.uid())) then raise exception 'Registration management permission required'; end if;
 if r.status<>'pending' then raise exception 'This request has already been reviewed'; end if;
 if p_approve and r.requester_type='organization' then
   perform public.add_organization_to_league(r.league_id,r.org_id);
 elsif p_approve and r.requester_type='athlete' then
   select id into v_season from league_seasons where league_id=r.league_id and is_active and registration_status='open' order by start_date desc nulls last limit 1;
   select om.org_id into v_org from organization_memberships om join league_organizations lo on lo.org_id=om.org_id and lo.league_id=r.league_id and lo.status='active' join athlete_profiles ap on ap.owner_user_id=om.user_id where ap.id=r.athlete_id and om.status='active' order by om.created_at limit 1;
   if v_season is null or v_org is null then raise exception 'This athlete needs an active league organization and an open season before approval'; end if;
   select tm.team_id into v_team from org_team_members tm join org_teams t on t.id=tm.team_id and t.org_id=v_org join league_team_assignments lta on lta.team_id=t.id and lta.league_id=r.league_id and lta.season_id=v_season and lta.status='active' where tm.athlete_id=r.athlete_id limit 1;
   insert into league_registrations(league_id,season_id,org_id,team_id,athlete_id,status) values(r.league_id,v_season,v_org,v_team,r.athlete_id,'pending') on conflict(league_id,season_id,athlete_id) do update set org_id=excluded.org_id,team_id=excluded.team_id,status='pending';
 end if;
 update league_join_requests set status=case when p_approve then 'approved' else 'declined' end,updated_at=now() where id=r.id;
 perform public.notify_user(r.requester_id,case when p_approve then 'League request approved' else 'League request update' end,case when p_approve then 'Your request to join the league was approved.' else 'The league was unable to approve your request.' end,'league_join_request',r.id);
 insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata) values(r.league_id,auth.uid(),case when p_approve then 'join_request_approved' else 'join_request_declined' end,'league_join_request',r.id,jsonb_build_object('requester_type',r.requester_type));
end $$;
revoke all on function public.review_league_join_request(uuid,boolean) from public,anon;
grant execute on function public.review_league_join_request(uuid,boolean) to authenticated;
