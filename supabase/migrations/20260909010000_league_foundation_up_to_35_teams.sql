-- League management foundation. Leagues are a scope above organizations and
-- preserve ownership of each organization's teams and private athlete data.

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text,
  general_location text,
  status text not null default 'active' check(status in ('active','inactive','archived')),
  max_teams integer not null default 35 check(max_teams between 1 and 35),
  billing_model text not null default 'central' check(billing_model in ('central','organization_paid')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.league_memberships (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('league_admin','division_admin','finance_manager','registrar','compliance_manager','read_only_auditor')),
  status text not null default 'active' check(status in ('invited','active','suspended','removed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(league_id,user_id)
);
create table if not exists public.league_organizations (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'active' check(status in ('invited','active','inactive')),
  joined_at timestamptz default now(), unique(league_id,org_id)
);
create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null, start_date date, end_date date, is_active boolean not null default false,
  registration_status text not null default 'closed' check(registration_status in ('draft','open','closed')),
  created_at timestamptz not null default now(), unique(league_id,name)
);
create table if not exists public.league_divisions (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid references public.league_seasons(id) on delete cascade, name text not null,
  age_group text, competition_level text, created_at timestamptz not null default now()
);
create table if not exists public.league_team_assignments (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  division_id uuid references public.league_divisions(id) on delete set null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.org_teams(id) on delete cascade,
  status text not null default 'active' check(status in ('pending','active','withdrawn')),
  created_at timestamptz not null default now(), unique(league_id,season_id,team_id)
);
create table if not exists public.league_permissions (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  membership_id uuid not null references public.league_memberships(id) on delete cascade,
  scope_type text not null check(scope_type in ('league','division','organization','team')),
  scope_id uuid, permissions jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(membership_id,scope_type,scope_id)
);
create table if not exists public.league_registrations (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete set null,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','eligible','ineligible','waitlisted','withdrawn')),
  registered_at timestamptz not null default now(), unique(league_id,season_id,athlete_id)
);
create table if not exists public.league_fees (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid references public.league_seasons(id) on delete set null, org_id uuid references public.organizations(id) on delete cascade,
  title text not null, amount_cents bigint not null check(amount_cents>=0), due_at timestamptz,
  status text not null default 'active' check(status in ('draft','active','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.league_fee_assignments (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  fee_id uuid not null references public.league_fees(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  athlete_id uuid references public.athlete_profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>=0), paid_cents bigint not null default 0 check(paid_cents>=0),
  status text not null default 'unpaid' check(status in ('unpaid','partial','paid','waived','refunded','disputed')),
  due_at timestamptz, paid_at timestamptz, provider_payment_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(org_id is not null or athlete_id is not null), check(paid_cents<=amount_cents)
);
create table if not exists public.league_announcements (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid references public.league_seasons(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  audience text not null default 'league' check(audience in ('league','division','organization','team')),
  audience_id uuid, title text not null, body text not null, published_at timestamptz not null default now()
);
create table if not exists public.league_documents (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid references public.league_seasons(id) on delete set null,
  title text not null, document_type text not null, target_type text not null check(target_type in ('organization','coach','team','athlete')),
  due_at timestamptz, is_required boolean not null default true, storage_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.league_document_submissions (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  document_id uuid not null references public.league_documents(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  team_id uuid references public.org_teams(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  storage_path text not null, status text not null default 'submitted' check(status in ('submitted','approved','rejected','expired')),
  reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.league_audit_events (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null, event_type text not null,
  record_type text, record_id uuid, metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);
create table if not exists public.league_games (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  division_id uuid references public.league_divisions(id) on delete set null,
  home_team_id uuid not null references public.org_teams(id), away_team_id uuid not null references public.org_teams(id),
  starts_at timestamptz not null, location text, status text not null default 'scheduled' check(status in ('scheduled','in_progress','final','cancelled','postponed')),
  home_score integer, away_score integer, submitted_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
  check(home_team_id<>away_team_id)
);

create index if not exists league_memberships_user_idx on public.league_memberships(user_id,status);
create index if not exists league_orgs_org_idx on public.league_organizations(org_id,status);
create index if not exists league_assignments_team_idx on public.league_team_assignments(team_id,season_id,status);
create index if not exists league_registrations_scope_idx on public.league_registrations(league_id,season_id,org_id,status);
create index if not exists league_games_schedule_idx on public.league_games(league_id,season_id,starts_at);

create or replace function public.is_league_member(p_league_id uuid,p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$ select exists(select 1 from league_memberships m where m.league_id=p_league_id and m.user_id=p_user_id and m.status='active') $$;
create or replace function public.is_league_admin(p_league_id uuid,p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$ select exists(select 1 from league_memberships m where m.league_id=p_league_id and m.user_id=p_user_id and m.status='active' and m.role='league_admin') $$;
create or replace function public.user_has_league_context(p_league_id uuid,p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_league_member(p_league_id,p_user_id) or exists(
  select 1 from league_organizations lo join organization_memberships om on om.org_id=lo.org_id
  where lo.league_id=p_league_id and lo.status='active' and om.user_id=p_user_id and om.status='active') or exists(
  select 1 from league_registrations lr join athlete_profiles ap on ap.id=lr.athlete_id
  where lr.league_id=p_league_id and ap.owner_user_id=p_user_id and lr.status not in ('withdrawn'));
$$;
revoke all on function public.is_league_member(uuid,uuid),public.is_league_admin(uuid,uuid),public.user_has_league_context(uuid,uuid) from public,anon;
grant execute on function public.is_league_member(uuid,uuid),public.is_league_admin(uuid,uuid),public.user_has_league_context(uuid,uuid) to authenticated;

do $$ declare t text; begin foreach t in array array['leagues','league_memberships','league_organizations','league_seasons','league_divisions','league_team_assignments','league_permissions','league_registrations','league_fees','league_fee_assignments','league_announcements','league_documents','league_document_submissions','league_audit_events','league_games'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy leagues_context_read on public.leagues for select to authenticated using(user_has_league_context(id) or is_admin(auth.uid()));
create policy league_memberships_context_read on public.league_memberships for select to authenticated using(user_id=auth.uid() or is_league_admin(league_id) or is_admin(auth.uid()));
create policy league_memberships_admin_manage on public.league_memberships for all to authenticated using(is_league_admin(league_id) or is_admin(auth.uid())) with check(is_league_admin(league_id) or is_admin(auth.uid()));
do $$ declare t text; begin foreach t in array array['league_organizations','league_seasons','league_divisions','league_team_assignments','league_permissions','league_fees','league_fee_assignments','league_announcements','league_documents','league_document_submissions','league_audit_events','league_games'] loop execute format('create policy %I on public.%I for select to authenticated using(user_has_league_context(league_id) or is_admin(auth.uid()))','context_read_'||t,t); execute format('create policy %I on public.%I for all to authenticated using(is_league_admin(league_id) or is_admin(auth.uid())) with check(is_league_admin(league_id) or is_admin(auth.uid()))','admin_manage_'||t,t); end loop; end $$;
create policy league_registrations_scoped_read on public.league_registrations for select to authenticated using(
 is_league_admin(league_id) or is_admin(auth.uid()) or exists(select 1 from athlete_profiles ap where ap.id=athlete_id and ap.owner_user_id=auth.uid()) or
 exists(select 1 from organization_memberships om where om.org_id=league_registrations.org_id and om.user_id=auth.uid() and om.status='active'));
create policy league_registrations_admin_manage on public.league_registrations for all to authenticated using(is_league_admin(league_id) or is_admin(auth.uid())) with check(is_league_admin(league_id) or is_admin(auth.uid()));

create or replace function public.enforce_league_team_limit() returns trigger language plpgsql set search_path=public as $$
declare allowed integer; used integer; begin select max_teams into allowed from leagues where id=new.league_id; select count(distinct team_id) into used from league_team_assignments where league_id=new.league_id and status='active' and id<>new.id; if new.status='active' and used>=allowed then raise exception 'League team limit of % reached',allowed; end if; if not exists(select 1 from league_organizations lo where lo.league_id=new.league_id and lo.org_id=new.org_id and lo.status='active') then raise exception 'Team organization must be active in this league'; end if; if not exists(select 1 from org_teams t where t.id=new.team_id and t.org_id=new.org_id) then raise exception 'Team must belong to the assigned organization'; end if; return new; end $$;
create trigger enforce_league_team_limit before insert or update on public.league_team_assignments for each row execute function public.enforce_league_team_limit();

-- League workspaces plug into the existing multi-workspace portal switcher.
alter table public.business_workspaces add column if not exists league_id uuid references public.leagues(id) on delete cascade;
alter table public.business_workspaces drop constraint if exists business_workspaces_workspace_type_check;
alter table public.business_workspaces add constraint business_workspaces_workspace_type_check check(workspace_type in ('organization','independent_coach','league'));
alter table public.business_workspaces drop constraint if exists business_workspaces_check;
alter table public.business_workspaces add constraint business_workspaces_owner_check check(
 (workspace_type='organization' and organization_id is not null and league_id is null) or
 (workspace_type='independent_coach' and owner_user_id is not null and organization_id is null and league_id is null) or
 (workspace_type='league' and league_id is not null and organization_id is null));
create unique index if not exists business_workspaces_league_uidx on public.business_workspaces(league_id) where workspace_type='league';
alter table public.workspace_memberships drop constraint if exists workspace_memberships_roles_check;
alter table public.workspace_memberships add constraint workspace_memberships_roles_check check(roles <@ array['owner','org_admin','coach','assistant_coach','team_manager','athlete','league_admin','division_admin','finance_manager','registrar','compliance_manager','read_only_auditor']::text[]);
insert into public.business_workspaces(workspace_type,league_id,owner_user_id,display_name)
select 'league',l.id,(select lm.user_id from league_memberships lm where lm.league_id=l.id and lm.role='league_admin' and lm.status='active' limit 1),l.name from leagues l on conflict do nothing;
insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status)
select w.id,lm.user_id,array[lm.role],case when lm.role='league_admin' then '{"manage_members":true,"manage_organizations":true,"manage_divisions":true,"manage_teams":true,"manage_schedule":true,"manage_registrations":true,"manage_payments":true,"manage_documents":true,"send_announcements":true,"view_reports":true,"view_audit":true,"export_records":true}'::jsonb else '{}'::jsonb end,'active'
from league_memberships lm join business_workspaces w on w.league_id=lm.league_id where lm.status='active' on conflict(workspace_id,user_id) do update set roles=excluded.roles,permissions=excluded.permissions,status='active';

drop function if exists public.available_workspaces();
create function public.available_workspaces() returns table(workspace_id uuid,workspace_type text,display_name text,organization_id uuid,league_id uuid,roles text[],permissions jsonb,is_last_used boolean)
language sql stable security definer set search_path=public as $$ select w.id,w.workspace_type,w.display_name,w.organization_id,w.league_id,m.roles,m.permissions,coalesce(p.workspace_id=w.id,false) from workspace_memberships m join business_workspaces w on w.id=m.workspace_id left join active_workspace_preferences p on p.user_id=auth.uid() where m.user_id=auth.uid() and m.status='active' and w.status<>'archived' order by coalesce(p.workspace_id=w.id,false) desc,w.display_name $$;
revoke all on function public.available_workspaces() from public,anon; grant execute on function public.available_workspaces() to authenticated;

create or replace function public.my_league_contexts() returns table(league_id uuid,name text,sport text,general_location text,role text)
language sql stable security definer set search_path=public as $$
 select distinct l.id,l.name,l.sport,l.general_location,coalesce(lm.role,case when om.user_id is not null then 'organization_member' else 'athlete' end)
 from leagues l left join league_memberships lm on lm.league_id=l.id and lm.user_id=auth.uid() and lm.status='active'
 left join league_organizations lo on lo.league_id=l.id and lo.status='active'
 left join organization_memberships om on om.org_id=lo.org_id and om.user_id=auth.uid() and om.status='active'
 where lm.user_id is not null or om.user_id is not null or exists(select 1 from league_registrations lr join athlete_profiles ap on ap.id=lr.athlete_id where lr.league_id=l.id and ap.owner_user_id=auth.uid() and lr.status<>'withdrawn');
$$;
revoke all on function public.my_league_contexts() from public,anon; grant execute on function public.my_league_contexts() to authenticated;
